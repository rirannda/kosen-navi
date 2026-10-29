<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import 'leaflet/dist/leaflet.css';
	import '../map/mapLayers.css';
	import type * as L from 'leaflet';
	import { baseMapFiles, buildingMaps } from '../../data/maps';
	import type { BuildingMap } from '../../data/maps';
	import type { Node } from '../../data/types';
	import type { NavigationState, PoiHighlights } from '../states/navigation.svelte';
	import { highlightColors, highlightRoles } from '../map/highlightColors';
	import { createConnectedFloorLookup } from '../map/connectedFloors';
	import {
		createBuildingConnections,
		DEFAULT_CENTER_FOCUS_RADIUS,
		getFocusedBuildings
	} from '../map/focusedBuildings';
	import type { BuildingFocusPoint } from '../map/focusedBuildings';
	import { getVisibleBuildings } from '../map/visibleBuildings';
	import { createMapViewState } from '../map/state/view.svelte';
	import { createSvgLayers, MAP_BOUNDS, MAP_HEIGHT } from '../map/svgLayers';
	import { createRouteLayer } from '../map/routeLayer';
	import { createPoiLayer } from '../map/poiLayer';
	import { getNodeBuildingId } from '../map/nodeBuilding';
	import { getRouteEntryFloors } from '../route/routeFloors';
	import { getSvgOutlinePoints } from '../map/svgOutline';
	import { layoutFloorControls } from '../map/floorControlLayout';
	import type { FloorControlPlacement } from '../map/floorControlLayout';
	import type { LabelBounds } from '../route/labelLayout';
	import BuildingFloorControls from './BuildingFloorControls.svelte';
	import BottomSheet, { BOTTOM_SHEET_PEEK_HEIGHT } from './BottomSheet.svelte';
	import type { BottomSheetSnap } from './BottomSheet.svelte';
	import RouteSearchPanel from './layout/RouteSearchPanel.svelte';

	let { navigation }: { navigation: NavigationState } = $props();
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
	let bottomSheetSnap = $state<BottomSheetSnap>('bottom');
	let settledSheetSnap = $state<BottomSheetSnap>('bottom');
	let appliedFocusRequest: NavigationState['focusRequest'] = null;
	let bottomSheetHeight = $state(BOTTOM_SHEET_PEEK_HEIGHT);
	let previousSheetSnap: BottomSheetSnap = 'bottom';
	let previousSheetHeight = BOTTOM_SHEET_PEEK_HEIGHT;
	let sheetMapOffset = BOTTOM_SHEET_PEEK_HEIGHT / 2;
	let adjustingSheet = false;
	let focusingLocation = false;
	let renderedRoute: readonly string[] | null | undefined;
	let renderedHighlights: PoiHighlights = {};

	$effect(() => {
		const path = navigation.routePath;
		const highlights = navigation.highlights;
		const ready = svgLayersReady;
		untrack(() => {
			if (ready) renderNavigation(path, highlights);
		});
	});
	$effect(() => {
		const snap = bottomSheetSnap;
		const height = bottomSheetHeight;
		const ready = svgLayersReady;
		untrack(() => {
			if (!ready || (height === previousSheetHeight && snap === previousSheetSnap)) return;
			previousSheetHeight = height;
			previousSheetSnap = snap;
			// 見えている地図の中心を保ち、上の状態では中央以上に地図を動かしません。
			const offset = Math.round(Math.min(height, map!.getSize().y / 2) / 2);
			const movement = offset - sheetMapOffset;
			sheetMapOffset = offset;
			adjustingSheet = true;
			try {
				if (movement) map!.panBy([0, movement], { animate: false });
				setVisibleBuildings(getViewportBuildings(height, snap), false);
				updateDisplays();
			} finally {
				adjustingSheet = false;
			}
		});
	});

	$effect(() => {
		const request = navigation.focusRequest;
		if (request && svgLayersReady && bottomSheetSnap === settledSheetSnap) {
			untrack(() => {
				if (request === appliedFocusRequest) return;
				appliedFocusRequest = request;
				focusOnPoiId(request.poiId);
			});
		}
	});

	function renderNavigation(path = navigation.routePath, highlights = navigation.highlights) {
		if (!svgLayersReady || disposed) return;
		const routeChanged = path !== renderedRoute;
		let routeStart: Node | undefined;
		if (routeChanged) {
			renderedRoute = path;
			if (path) {
				routeStart = routeLayer!.draw(path);
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
		if (routeChanged && path && routeStart) {
			view.selectRouteFloors(getRouteEntryFloors(path, navigation.graph.nodes));
			setVisibleBuildings(getViewportBuildings(), false);
			updateDisplays();
			routeLayer!.fitFloor(routeStart.floor);
		}
		renderedHighlights = highlights;
		poiLayer!.render(highlights);
		scheduleBuildingControls();
		scheduleRouteLabels();
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
		const visibleHeight = Math.max(0, size.y - bottomSheetHeight);
		const containerRect = mapContainer.getBoundingClientRect();
		const obstacles: LabelBounds[] = Array.from(
			mapContainer.querySelectorAll('.leaflet-control, .poi-name-tooltip')
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
		const controls = view.visibleBuildings.flatMap(({ id }) => {
			const panel = buildingControlsContainer!.querySelector<HTMLElement>(
				`[data-building="${id}"]`
			);
			return panel && panel.offsetHeight + 16 <= visibleHeight
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
			{ width: size.x, height: visibleHeight },
			obstacles
		);
		buildingControlPositions = Object.fromEntries(
			positions.map((position) => [position.id, position])
		);
		scheduleRouteLabels();
	}

	function getViewportBuildings(
		sheetHeight = bottomSheetHeight,
		sheetSnap = bottomSheetSnap
	): BuildingMap[] {
		if (sheetSnap === 'top' || map!.getZoom() < SHOW_UI_ZOOM_THRESHOLD) return [];
		const size = map!.getSize();
		const visibleHeight = Math.max(0, size.y - sheetHeight);
		const margin = FLOOR_DISPLAY_EDGE_MARGIN;
		if (size.x <= margin * 2 || visibleHeight <= margin * 2) return [];
		const northWest = map!.containerPointToLatLng([margin, margin]);
		const southEast = map!.containerPointToLatLng([size.x - margin, visibleHeight - margin]);
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
		const center = map!.containerPointToLatLng([size.x / 2, visibleHeight / 2]);
		const viewportNorthWest = map!.containerPointToLatLng([0, 0]);
		const viewportSouthEast = map!.containerPointToLatLng([size.x, visibleHeight]);
		return getFocusedBuildings(
			candidates,
			{ x: center.lng, y: MAP_HEIGHT - center.lat },
			buildingConnections,
			outlines,
			sheetSnap === 'middle' ? 4 : 6,
			DEFAULT_CENTER_FOCUS_RADIUS / map!.getZoomScale(map!.getZoom(), 0),
			[
				viewportNorthWest.lng,
				MAP_HEIGHT - viewportNorthWest.lat,
				viewportSouthEast.lng,
				MAP_HEIGHT - viewportSouthEast.lat
			]
		);
	}

	function setVisibleBuildings(buildings: BuildingMap[], synchronizeSelection = true) {
		view.setVisibleBuildings(buildings, synchronizeSelection && !navigation.routePath);
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
		if (disposed || !svgLayersReady || adjustingSheet) return;
		setVisibleBuildings(getViewportBuildings(), !focusingLocation);
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
		const targetZoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), zoom));
		const center = map.project([y, x], targetZoom).add([0, bottomSheetHeight / 2]);
		map.off('moveend', finishLocationFocus);
		focusingLocation = true;
		map.flyTo(map.unproject(center, targetZoom), targetZoom, { duration: 1 });
		map.once('moveend', finishLocationFocus);
	}
	function finishLocationFocus() {
		focusingLocation = false;
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
						focusOnLocation(node.x, node.y, Math.max(SHOW_UI_ZOOM_THRESHOLD, mountedMap.getZoom()));
					},
					navigation.graph.edges
				);
				poiLayer = createPoiLayer(
					leaflet,
					mountedMap,
					mapContainer,
					svgLayers,
					navigation.graph.nodes,
					navigation.pois,
					(poiId) => {
						navigation.setHighlight(poiId);
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
			map?.off('moveend', finishLocationFocus);
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

<div
	class={[
		'map-wrapper relative isolate h-dvh w-full overflow-hidden [&_.leaflet-bottom.leaflet-right]:bottom-(--bottom-sheet-height)! [&_.leaflet-control-attribution]:mr-2!',
		bottomSheetSnap === 'top' && 'sheet-expanded'
	]}
	style:--bottom-sheet-height={`${bottomSheetHeight}px`}
>
	<div bind:this={mapContainer} class="map-container z-1 h-full w-full bg-[#898989]!"></div>
	<BuildingFloorControls
		buildings={view.visibleBuildings}
		positions={buildingControlPositions}
		colors={view.buildingOutlineColors}
		activeFloors={view.activeFloors}
		onfloorchange={switchFloor}
		onresize={scheduleBuildingControls}
		bind:container={buildingControlsContainer}
	/>
	<BottomSheet
		bind:snap={bottomSheetSnap}
		onheightchange={(height) => (bottomSheetHeight = height)}
		onsettle={(snap, height) => {
			bottomSheetHeight = height;
			settledSheetSnap = snap;
		}}
	>
		<RouteSearchPanel {navigation} bind:snap={bottomSheetSnap} />
	</BottomSheet>
</div>

<style>
	.sheet-expanded :global(.leaflet-control) {
		visibility: hidden;
		pointer-events: none;
	}
</style>
