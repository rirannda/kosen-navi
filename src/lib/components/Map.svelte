<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import 'leaflet/dist/leaflet.css';
	import '../map/mapLayers.css';
	import type * as L from 'leaflet';
	import type { Poi } from '../../data/types';
	import { baseMapFiles, buildingMaps } from '../../data/maps';
	import type { BuildingMap } from '../../data/maps';
	import { createNavigationState, getNavigation } from '../states/navigation.svelte';
	import type { NavigationState, PoiHighlights } from '../states/navigation.svelte';
	import { highlightColors, highlightRoles } from '../map/highlightColors';
	import type { HighlightColor } from '../map/highlightColors';
	import { createConnectedFloorLookup } from '../map/connectedFloors';
	import { createBuildingConnections, getFocusedBuildings } from '../map/focusedBuildings';
	import type { BuildingFocusPoint } from '../map/focusedBuildings';
	import { getVisibleBuildings } from '../map/visibleBuildings';
	import { createMapViewState } from '../map/state/view.svelte';
	import { createSvgLayers, MAP_BOUNDS, MAP_HEIGHT } from '../map/svgLayers';
	import { createRouteLayer } from '../map/routeLayer';
	import { createPoiLayer } from '../map/poiLayer';
	import { getNodeBuildingId } from '../map/nodeBuilding';
	import { getSvgOutlinePoints } from '../map/svgOutline';
	import { layoutFloorControls } from '../map/floorControlLayout';
	import type { FloorControlPlacement } from '../map/floorControlLayout';
	import type { LabelBounds } from '../route/labelLayout';
	import BuildingFloorControls from './BuildingFloorControls.svelte';

	let {
		navigation = getNavigation() ?? createNavigationState(),
		selectedPoi = $bindable<Poi | null>(null)
	}: {
		navigation?: NavigationState;
		/** 既存利用側向けの選択バインディング。新規利用側はnavigationを共有します。 */
		selectedPoi?: Poi | null;
	} = $props();
	const initialNavigation = untrack(() => navigation);
	const getConnectedFloor = createConnectedFloorLookup(
		initialNavigation.graph.nodes,
		initialNavigation.graph.edges
	);
	const buildingConnections = createBuildingConnections(buildingMaps, getConnectedFloor);
	const view = createMapViewState(buildingMaps, getConnectedFloor);
	const SHOW_UI_ZOOM_THRESHOLD = 0;
	const FLOOR_DISPLAY_EDGE_MARGIN = 48;
	let mapContainer: HTMLDivElement;
	let map: L.Map | undefined;
	let svgLayers: ReturnType<typeof createSvgLayers> | undefined;
	let routeLayer: ReturnType<typeof createRouteLayer> | undefined;
	let poiLayer: ReturnType<typeof createPoiLayer> | undefined;
	let svgLayersReady = $state(false);
	let disposed = false;
	let buildingControlsContainer = $state<HTMLDivElement>();
	let buildingControlFrame: number | undefined;
	let routeLabelFrame: number | undefined;
	let buildingControlPositions = $state<Record<string, FloorControlPlacement>>({});
	const switchableBuildings = $derived(
		view.visibleBuildings.filter((building) => Object.keys(building.floors).length > 1)
	);
	const pendingPoiHighlights: Partial<Record<HighlightColor, { poiId: string; focus: boolean }>> =
		{};
	let renderedRoute: readonly string[] | null | undefined;
	let renderedHighlights: PoiHighlights = {};
	let lastPublishedPoi: Poi | null = null;

	function publishSelection() {
		lastPublishedPoi = navigation.selectedPoi;
		if (selectedPoi?.id !== lastPublishedPoi?.id) selectedPoi = lastPublishedPoi;
	}

	// 旧バインディングへの親からの変更も、同じ共有状態へ反映します。
	$effect(() => {
		const requested = selectedPoi;
		untrack(() => {
			if (requested?.id === lastPublishedPoi?.id) return;
			if (requested) navigation.setHighlight(requested.id);
			else navigation.clearHighlight('selected');
			publishSelection();
		});
	});
	$effect(() => {
		const selected = navigation.selectedPoi;
		untrack(() => {
			lastPublishedPoi = selected;
			if (selectedPoi?.id !== selected?.id) selectedPoi = selected;
		});
	});
	$effect(() => {
		const path = navigation.routePath;
		const highlights = navigation.highlights;
		const ready = svgLayersReady;
		untrack(() => {
			if (ready) renderNavigation(path, highlights);
		});
	});

	$effect(() => {
		const request = navigation.focusRequest;
		if (request) untrack(() => focusOnPoiId(request.poiId));
	});

	function renderNavigation(path = navigation.routePath, highlights = navigation.highlights) {
		if (!svgLayersReady || disposed) return;
		if (path !== renderedRoute) {
			renderedRoute = path;
			if (path) {
				const start = routeLayer!.draw(path);
				if (start) {
					switchFloor(getNodeBuildingId(start) || view.zoomedBldg, start.floor);
					routeLayer!.fitFloor(view.activeFloor);
				}
			} else routeLayer!.clear();
		}
		for (const role of highlightRoles) {
			const id = highlights[role];
			if (!id || id === renderedHighlights[role]) continue;
			const target = navigation.resolvePoi(id);
			if (target && poiLayer!.findTarget(id)) {
				const buildingId = getNodeBuildingId(target.node);
				if (buildingId !== 'outdoor') switchFloor(buildingId, target.node.floor);
			}
		}
		renderedHighlights = highlights;
		poiLayer!.render(highlights);
		publishSelection();
		scheduleBuildingControls();
		scheduleRouteLabels();
	}

	export function clearPoiHighlight(color: HighlightColor | undefined = undefined) {
		if (color !== undefined && !highlightRoles.includes(color)) {
			console.error(`ハイライトの色が見つかりません: ${color}`);
			return;
		}
		for (const role of color ? [color] : highlightRoles) delete pendingPoiHighlights[role];
		navigation.clearHighlight(color);
		publishSelection();
		renderNavigation();
	}
	export function highlightPoiById(poiId: string, color: HighlightColor = 'selected'): boolean {
		return applyPoiHighlight(poiId, color, true);
	}
	function applyPoiHighlight(poiId: string, color: HighlightColor, focus: boolean): boolean {
		if (disposed) return false;
		if (!highlightRoles.includes(color)) {
			console.error(`ハイライトの色が見つかりません: ${color}`);
			return false;
		}
		const target = navigation.resolvePoi(poiId);
		if (!target) {
			console.error(`POIまたはノードが見つかりません: ${poiId}`);
			return false;
		}
		if (!svgLayersReady) {
			delete pendingPoiHighlights[color];
			pendingPoiHighlights[color] = { poiId, focus };
			navigation.setHighlight(poiId, color);
			publishSelection();
			return true;
		}
		if (!poiLayer!.findTarget(poiId)) {
			console.error(`POIのSVG要素が見つかりません: ${poiId} (${target.poi.svgId})`);
			return false;
		}
		delete pendingPoiHighlights[color];
		navigation.setHighlight(poiId, color);
		const buildingId = getNodeBuildingId(target.node);
		if (buildingId !== 'outdoor') switchFloor(buildingId, target.node.floor);
		renderNavigation();
		if (focus) focusOnLocation(target.node.x, target.node.y, 1);
		return true;
	}
	export function showRoute(startId: string, goalId: string): string[] | null {
		const path = navigation.showRoute(startId, goalId);
		renderNavigation();
		return path;
	}
	export function clearRoute() {
		navigation.clearRoute();
		renderNavigation();
	}

	function scheduleBuildingControls() {
		if (disposed || !svgLayersReady || buildingControlFrame !== undefined) return;
		buildingControlFrame = requestAnimationFrame(() => {
			buildingControlFrame = undefined;
			updateBuildingControls();
		});
	}
	function scheduleRouteLabels() {
		if (disposed || !svgLayersReady || routeLabelFrame !== undefined) return;
		routeLabelFrame = requestAnimationFrame(() => {
			routeLabelFrame = undefined;
			routeLayer?.updateLabels();
		});
	}
	function updateBuildingControls() {
		if (!map || !svgLayers || !buildingControlsContainer) return;
		const size = map.getSize();
		const containerRect = mapContainer.getBoundingClientRect();
		const obstacles: LabelBounds[] = Array.from(
			mapContainer.querySelectorAll('.leaflet-control-zoom, .poi-name-tooltip')
		).map((element) => {
			const rect = element.getBoundingClientRect();
			return {
				x: rect.left - containerRect.left,
				y: rect.top - containerRect.top,
				width: rect.width,
				height: rect.height
			};
		});
		const buildings = svgLayers!.getControlBuildings(view.activeFloors);
		const controls = switchableBuildings.flatMap(({ id }) => {
			const panel = buildingControlsContainer!.querySelector<HTMLElement>(
				`[data-building="${id}"]`
			);
			return panel
				? [
						{
							id,
							width: panel.offsetWidth,
							height: panel.offsetHeight,
							previousSide: buildingControlPositions[id]?.side
						}
					]
				: [];
		});
		const positions = layoutFloorControls(
			controls,
			buildings,
			{ width: size.x, height: size.y },
			obstacles
		);
		buildingControlPositions = Object.fromEntries(
			positions.map((position) => [position.id, position])
		);
		scheduleRouteLabels();
	}

	function getViewportBuildings(): BuildingMap[] {
		if (map!.getZoom() < SHOW_UI_ZOOM_THRESHOLD) return [];
		const size = map!.getSize();
		const margin = FLOOR_DISPLAY_EDGE_MARGIN;
		if (size.x <= margin * 2 || size.y <= margin * 2) return [];
		const northWest = map!.containerPointToLatLng([margin, margin]);
		const southEast = map!.containerPointToLatLng([size.x - margin, size.y - margin]);
		const candidates = getVisibleBuildings(buildingMaps, [
			northWest.lng,
			MAP_HEIGHT - northWest.lat,
			southEast.lng,
			MAP_HEIGHT - southEast.lat
		]);
		const outlines = new SvelteMap<string, readonly BuildingFocusPoint[]>();
		for (const { id } of candidates) {
			const floor = view.activeFloors[id] ?? view.availableFloor(id, view.activeFloor);
			const outline = svgLayers?.getOutline(id, floor);
			if (outline instanceof SVGGeometryElement) outlines.set(id, getSvgOutlinePoints(outline));
		}
		const center = map!.getCenter();
		return getFocusedBuildings(
			candidates,
			{ x: center.lng, y: MAP_HEIGHT - center.lat },
			buildingConnections,
			outlines
		);
	}

	function setVisibleBuildings(buildings: BuildingMap[]) {
		view.setVisibleBuildings(buildings);
		scheduleBuildingControls();
	}
	function updateDisplays() {
		if (disposed || !svgLayersReady) return;
		svgLayers!.updateVisible(view.visibleBuildings, view.activeFloors, view.buildingOutlineColors);
		poiLayer!.updateVisible();
		routeLayer!.updateVisible();
		scheduleBuildingControls();
		scheduleRouteLabels();
	}
	function updateMapState() {
		if (disposed || !svgLayersReady) return;
		setVisibleBuildings(getViewportBuildings());
		updateDisplays();
	}
	function switchFloor(buildingId: string, floor: number) {
		if (!map) return;
		view.selectFloor(buildingId, floor);
		if (
			!buildingMaps.some((building) => building.id === buildingId) ||
			map.getZoom() < SHOW_UI_ZOOM_THRESHOLD
		) {
			setVisibleBuildings([]);
		} else if (!view.visibleBuildings.some(({ id }) => id === buildingId)) {
			setVisibleBuildings(getViewportBuildings());
		} else view.synchronize(buildingId);
		updateDisplays();
	}
	function focusOnLocation(x: number, y: number, zoom = 3) {
		if (!map) {
			console.error('マップが初期化されていません');
			return;
		}
		map.flyTo([y, x], zoom, { duration: 1 });
	}
	export function focusOnPoiId(poiId: string) {
		const target = navigation.resolvePoi(poiId);
		if (!target) {
			console.error(`POIまたはノードが見つかりません: ${poiId}`);
			return;
		}
		switchFloor(getNodeBuildingId(target.node), target.node.floor);
		focusOnLocation(target.node.x, target.node.y, 2);
	}

	onMount(() => {
		for (const [role, colors] of Object.entries(highlightColors)) {
			for (const [property, value] of Object.entries(colors))
				mapContainer.style.setProperty(`--poi-${role}-${property}`, value);
		}
		async function initMap() {
			try {
				const leaflet = await import('leaflet');
				if (disposed) return;
				const mountedMap = leaflet.map(mapContainer, {
					crs: leaflet.CRS.Simple,
					minZoom: -1,
					maxZoom: 2,
					zoomControl: true,
					maxBounds: MAP_BOUNDS,
					maxBoundsViscosity: 1
				});
				map = mountedMap;
				for (const [name, zIndex] of [
					['floor-maps', 420],
					['route-lines', 430]
				] as const) {
					mountedMap.createPane(name).style.zIndex = String(zIndex);
				}
				svgLayers = createSvgLayers(leaflet, mountedMap, mapContainer, buildingMaps, baseMapFiles);
				routeLayer = createRouteLayer(
					leaflet,
					mountedMap,
					mapContainer,
					navigation.graph.nodes,
					() => view,
					(node) => {
						switchFloor(getNodeBuildingId(node) || view.zoomedBldg, node.floor);
						focusOnLocation(node.x, node.y, mountedMap.getZoom());
					}
				);
				poiLayer = createPoiLayer(
					leaflet,
					mountedMap,
					mapContainer,
					svgLayers,
					navigation.graph.nodes,
					navigation.pois,
					(poiId) => {
						applyPoiHighlight(poiId, 'selected', false);
					}
				);
				const selections = await svgLayers.load();
				if (disposed) return;
				for (const { layer, buildingId, floor } of selections)
					poiLayer.enableSelection(layer, buildingId, floor);
				svgLayersReady = true;
				mountedMap.on('move zoom resize zoomend moveend', updateMapState);
				mountedMap.on('move zoom resize tooltipopen tooltipclose', scheduleRouteLabels);
				mountedMap.fitBounds(MAP_BOUNDS);
				updateMapState();
				renderNavigation();
				for (const [color, request] of Object.entries(pendingPoiHighlights)) {
					if (navigation.highlights[color as HighlightColor] === request.poiId) {
						applyPoiHighlight(request.poiId, color as HighlightColor, request.focus);
					}
				}
			} catch (error) {
				if (!disposed) console.error('マップの初期化エラー:', error);
			}
		}
		void initMap();
		return () => {
			disposed = true;
			svgLayersReady = false;
			if (buildingControlFrame !== undefined) cancelAnimationFrame(buildingControlFrame);
			if (routeLabelFrame !== undefined) cancelAnimationFrame(routeLabelFrame);
			map?.off('move zoom resize zoomend moveend', updateMapState);
			map?.off('move zoom resize tooltipopen tooltipclose', scheduleRouteLabels);
			poiLayer?.dispose();
			routeLayer?.dispose();
			svgLayers?.dispose();
			if (map) {
				const mountedMap = map;
				if (mapContainer.querySelector('.leaflet-zoom-anim'))
					mountedMap.once('zoomend', () => mountedMap.remove());
				else mountedMap.remove();
			}
		};
	});
</script>

<div class="map-wrapper">
	<div bind:this={mapContainer} class="map-container"></div>
	<BuildingFloorControls
		buildings={switchableBuildings}
		positions={buildingControlPositions}
		colors={view.buildingOutlineColors}
		activeFloors={view.activeFloors}
		onfloorchange={switchFloor}
		onresize={scheduleBuildingControls}
		bind:container={buildingControlsContainer}
	/>
</div>

<style>
	.map-wrapper {
		position: relative;
		isolation: isolate;
		width: 100%;
		height: 100dvh;
		overflow: hidden;
	}

	.map-container {
		width: 100%;
		height: 100%;
		background-color: #f0f0f0;
		z-index: 1;
	}
</style>
