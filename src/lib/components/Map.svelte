<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import 'leaflet/dist/leaflet.css';
	import type * as LType from 'leaflet';
	import { aStar } from '../aStar/aStar';
	import { buildGraph } from '../aStar/buildGraph';
	import { getRouteDisplay } from '../route/routeDisplay';
	import { highlightColors } from '../map/highlightColors';
	import { getNearbyBuildings } from '../map/nearbyBuildings';
	import type { HighlightColor } from '../map/highlightColors';
	import type { Node as MapNode, Poi } from '../../data/types';
	import { baseMapFiles, buildingMaps } from '../../data/maps';
	import type { BuildingMap } from '../../data/maps';
	import { edges } from '../../data/edges';
	import { edgeStairs } from '../../data/edge_stair';
	import { nodes } from '../../../src/data/nodes';
	import { pois } from '../../../src/data/pois';

	const graph = buildGraph(nodes, edges, edgeStairs);
	const highlightRoles = ['start', 'goal', 'selected'] as const;
	const buildingOutlinePalette = ['#2563eb', '#ea580c'] as const;
	type PoiHighlight = { poi: Poi; layer: LType.SVGOverlay; element: SVGGraphicsElement };
	type PoiHighlightDisplay = PoiHighlight & { color: HighlightColor; tooltip: LType.Tooltip };
	let { selectedPoi = $bindable<Poi | null>(null) }: { selectedPoi?: Poi | null } = $props();

	let mapContainer: HTMLElement;
	let map: LType.Map;
	let leaflet: typeof LType | undefined;
	let pendingRoutePath: string[] | null = null;
	let routeLayersByFloor: Partial<Record<number, LType.Polyline[]>> = {};
	let routeMarkersByFloor: Partial<Record<number, LType.Marker[]>> = {};
	let routePointsByFloor: Partial<Record<number, LType.LatLngExpression[]>> = {};
	const routeBuildingByLayer = new WeakMap<LType.Layer, string>();
	let svgLayersReady = false;
	const pendingPoiHighlights: Partial<Record<HighlightColor, { poiId: string; focus: boolean }>> =
		{};
	const poiHighlights: Partial<Record<HighlightColor, PoiHighlight>> = {};
	let poiHighlightDisplays: PoiHighlightDisplay[] = [];
	const svgElementsByLayer = new WeakMap<LType.SVGOverlay, SVGElement>();
	const poiSelectionCleanups: (() => void)[] = [];

	let showBldgMenu = $state(false);
	let zoomedBldg = $state('');
	let activeFloor = $state(1);
	let visibleBuildings = $state<BuildingMap[]>([]);
	let activeFloors = $state<Record<string, number>>({});
	let buildingOutlineColors = $state<Record<string, string>>({});
	const buildingFloorLayers: Record<string, Partial<Record<number, LType.SVGOverlay>>> = {};
	const overviewLayers: Record<string, LType.SVGOverlay> = {};
	const visibleFloorLayers = new SvelteSet<LType.SVGOverlay>();

	function getNodeBuildingId(node: MapNode): string {
		return node.buildingId ?? /^node_(.+)_f-?\d+_/.exec(node.id)?.[1] ?? '';
	}

	function updateVisiblePoi() {
		if (!map) return;
		for (const { layer, element, tooltip } of poiHighlightDisplays) {
			if (!map.hasLayer(layer)) {
				tooltip.remove();
				continue;
			}
			const bounds = element.getBBox();
			const matrix = element.getScreenCTM();
			if (!matrix) continue;
			const center = new DOMPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
			const screenPoint = center.matrixTransform(matrix);
			const containerBounds = mapContainer.getBoundingClientRect();
			const location = map.containerPointToLatLng([
				screenPoint.x - containerBounds.left,
				screenPoint.y - containerBounds.top
			]);
			tooltip.setLatLng(location);
			if (!map.hasLayer(tooltip)) tooltip.addTo(map);
		}
	}

	function updatePoiHighlights() {
		const L = leaflet;
		if (!L) return;
		const entries = highlightRoles.flatMap((color) => {
			const highlight = poiHighlights[color];
			return highlight ? [{ ...highlight, color }] : [];
		});
		// 同じ部屋に複数の役割がある場合は、selected > goal > start の色を優先します。
		const targets = entries.filter(
			(entry, index) => !entries.slice(index + 1).some((other) => other.element === entry.element)
		);
		for (const display of poiHighlightDisplays) {
			if (!targets.some((target) => target.element === display.element)) {
				display.element.classList.remove('poi-highlight', `poi-color-${display.color}`);
				display.tooltip.remove();
			}
		}
		poiHighlightDisplays = targets.map((target) => {
			const previous = poiHighlightDisplays.find((display) => display.element === target.element);
			const tooltip =
				previous?.tooltip ??
				L.tooltip({
					permanent: true,
					direction: 'top',
					offset: [0, -8],
					opacity: 1
				});
			if (previous) {
				target.element.classList.remove(`poi-color-${previous.color}`);
				tooltip.getElement()?.classList.remove(`poi-color-${previous.color}`);
			}
			target.element.classList.add('poi-highlight', `poi-color-${target.color}`);
			tooltip.options.className = `poi-name-tooltip poi-color-${target.color}`;
			tooltip.getElement()?.classList.add(`poi-color-${target.color}`);
			const label = document.createElement('span');
			label.textContent = target.poi.name;
			tooltip.setContent(label);
			return { ...target, tooltip };
		});
		updateVisiblePoi();
	}

	export function clearPoiHighlight(color?: HighlightColor) {
		if (color !== undefined && !highlightRoles.includes(color)) {
			console.error(`ハイライトの色が見つかりません: ${color}`);
			return;
		}
		for (const role of color ? [color] : highlightRoles) {
			delete poiHighlights[role];
			delete pendingPoiHighlights[role];
		}
		if ((!color || color === 'selected') && selectedPoi !== null) selectedPoi = null;
		updatePoiHighlights();
	}

	/** POIを強調して名前を表示。対象不明時はfalse、初期化前は表示を予約してtrue。 */
	export function highlightPoiById(poiId: string, color: HighlightColor = 'selected'): boolean {
		return applyPoiHighlight(poiId, color, true);
	}

	function applyPoiHighlight(poiId: string, color: HighlightColor, focus: boolean): boolean {
		if (!highlightRoles.includes(color)) {
			console.error(`ハイライトの色が見つかりません: ${color}`);
			return false;
		}
		const poi = pois.find((candidate) => candidate.id === poiId);
		if (!poi) {
			console.error(`POIが見つかりません: ${poiId}`);
			return false;
		}
		const node = nodes.find((candidate) => candidate.id === poi.nodeId);
		if (!node) {
			console.error(`POIのノードが見つかりません: ${poi.nodeId}`);
			return false;
		}
		if (!svgLayersReady || !map || !leaflet) {
			delete pendingPoiHighlights[color];
			pendingPoiHighlights[color] = { poiId, focus };
			return true;
		}

		const buildingId = node.buildingId ?? /^node_(.+)_f-?\d+_/.exec(node.id)?.[1];
		const layer = buildingId ? buildingFloorLayers[buildingId]?.[node.floor] : undefined;
		const svg = layer ? svgElementsByLayer.get(layer) : undefined;
		// 建物・階のSVG内だけを探し、別の地図にある同名の要素を選ばないようにします。
		const element = svg?.querySelector(`#${CSS.escape(poi.svgId)}`);
		if (!layer || !(element instanceof SVGGraphicsElement)) {
			console.error(`POIのSVG要素が見つかりません: ${poiId} (${poi.svgId})`);
			return false;
		}

		delete pendingPoiHighlights[color];
		poiHighlights[color] = { poi, layer, element };
		if (color === 'selected') selectedPoi = poi;
		switchFloor(buildingId ?? '', node.floor);
		if (!map.hasLayer(layer)) layer.addTo(map);
		updatePoiHighlights();
		if (focus) focusOnLocation(node.x, node.y, 2);
		return true;
	}

	function enablePoiSelection(layer: LType.SVGOverlay, buildingId: string, floor: number) {
		const svg = svgElementsByLayer.get(layer);
		if (!svg) return;
		const nodeById = new Map(nodes.map((node) => [node.id, node]));
		const poiElements = pois.flatMap((poi) => {
			const node = nodeById.get(poi.nodeId);
			if (!node || node.floor !== floor) return [];
			const poiBuildingId = node.buildingId ?? /^node_(.+)_f-?\d+_/.exec(node.id)?.[1];
			if (poiBuildingId !== buildingId) return [];
			const element = svg.querySelector(`#${CSS.escape(poi.svgId)}`);
			if (!(element instanceof SVGGraphicsElement)) return [];
			return [{ poi, element }];
		});
		const poiBySvgId = new Map(poiElements.map(({ poi }) => [poi.svgId, poi]));
		for (const { poi, element } of poiElements) {
			element.classList.add('poi-selectable');
			element.setAttribute('role', 'button');
			element.setAttribute('tabindex', '0');
			element.setAttribute('aria-label', poi.name);
		}

		function selectTarget(target: EventTarget | null): boolean {
			if (!map?.hasLayer(layer) || !(target instanceof Element)) return false;
			// POIのSVGがグループの場合は、タップした子要素から親へ辿って探します。
			for (
				let element: Element | null = target;
				element && element !== svg;
				element = element.parentElement
			) {
				const poi = poiBySvgId.get(element.id);
				if (poi) return applyPoiHighlight(poi.id, 'selected', false);
			}
			return false;
		}

		// Leafletのclickを使い、地図をドラッグした直後の誤選択を防ぎます。
		const onClick = (event: LType.LeafletMouseEvent) => {
			selectTarget(event.originalEvent.target);
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if ((event.key === 'Enter' || event.key === ' ') && selectTarget(event.target)) {
				event.preventDefault();
			}
		};
		layer.on('click', onClick);
		svg.addEventListener('keydown', onKeyDown);
		poiSelectionCleanups.push(() => {
			layer.off('click', onClick);
			svg.removeEventListener('keydown', onKeyDown);
		});
	}

	function updateVisibleRoute() {
		if (!map) return;
		const isVisible = (layer: LType.Layer, floor: number) =>
			(activeFloors[routeBuildingByLayer.get(layer) ?? ''] ?? activeFloor) === floor;

		for (const [floor, layers] of Object.entries(routeLayersByFloor)) {
			for (const layer of layers ?? []) {
				if (isVisible(layer, Number(floor))) {
					if (!map.hasLayer(layer)) layer.addTo(map);
					layer.bringToFront();
				} else {
					layer.remove();
				}
			}
		}
		for (const [floor, markers] of Object.entries(routeMarkersByFloor)) {
			for (const marker of markers ?? []) {
				if (isVisible(marker, Number(floor))) {
					if (!map.hasLayer(marker)) marker.addTo(map);
				} else {
					marker.remove();
				}
			}
		}
	}

	function fitCurrentFloorRoute() {
		if (!map || !leaflet) return;

		const floor = activeFloor;
		const points = routePointsByFloor[floor];
		if (!points?.length) return;

		map.fitBounds(leaflet.latLngBounds(points), {
			padding: [56, 64],
			maxZoom: 2
		});
	}

	function drawRoute(pathIds: string[]) {
		if (!svgLayersReady || !map || !leaflet) {
			pendingRoutePath = [...pathIds];
			return;
		}

		clearRoute();
		if (pathIds.length === 0) return;

		const { segments, transitions } = getRouteDisplay(pathIds, graph.nodes);

		for (const segment of segments) {
			const floor = segment[0].floor;
			const points: LType.LatLngExpression[] = segment.map((node) => [node.y, node.x]);
			const floorPoints = routePointsByFloor[floor] ?? [];
			floorPoints.push(...points);
			routePointsByFloor[floor] = floorPoints;

			if (points.length >= 2) {
				const line = leaflet.polyline(points, {
					pane: 'route-lines',
					color: '#2563eb',
					weight: 6,
					opacity: 0.9,
					lineCap: 'round',
					lineJoin: 'round'
				});
				routeBuildingByLayer.set(line, getNodeBuildingId(segment[0]));
				const floorLayers = routeLayersByFloor[floor] ?? [];
				floorLayers.push(line);
				routeLayersByFloor[floor] = floorLayers;
			}
		}

		function addTransitionMarker(
			node: MapNode,
			text: string,
			icon: 'stairs' | 'building',
			kind: 'entry' | 'exit',
			onClick?: () => void
		) {
			if (!leaflet) return;
			const symbol = document.createElement('span');
			const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			svg.classList.add('route-transition-icon', `route-transition-icon-${icon}`);
			svg.setAttribute('viewBox', '0 0 24 24');
			svg.setAttribute('aria-hidden', 'true');
			const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			path.setAttribute(
				'd',
				icon === 'stairs' ? 'M3 20h5v-5h5v-5h5V5h3' : 'M6 21V3h12v18M3 21h18M14 12h.01'
			);
			svg.appendChild(path);
			symbol.appendChild(svg);
			const label = document.createElement('span');
			label.textContent = text;
			const marker = leaflet.marker([node.y, node.x], {
				icon: leaflet.divIcon({
					html: symbol,
					className: `route-transition-marker route-transition-${kind}`,
					iconSize: [32, 32],
					iconAnchor: [16, 16]
				}),
				title: text,
				alt: text,
				keyboard: !!onClick,
				interactive: !!onClick,
				zIndexOffset: 1000
			});
			routeBuildingByLayer.set(marker, getNodeBuildingId(node));
			marker.bindTooltip(label, {
				permanent: true,
				direction: 'right',
				offset: [20, 0],
				className: `route-transition-label route-transition-label-${kind}`,
				opacity: 1
			});
			if (onClick) marker.on('click', onClick);
			const markers = routeMarkersByFloor[node.floor] ?? [];
			markers.push(marker);
			routeMarkersByFloor[node.floor] = markers;
		}

		for (const transition of transitions) {
			addTransitionMarker(transition.from, transition.label, transition.icon, 'entry', () => {
				const buildingId =
					transition.to.buildingId ?? /^node_(.+)_f-?\d+_/.exec(transition.to.id)?.[1];
				switchFloor(buildingId ?? zoomedBldg, transition.to.floor);
				focusOnLocation(transition.to.x, transition.to.y, map.getZoom());
			});
			if (transition.exit) {
				addTransitionMarker(transition.to, transition.exit.label, transition.icon, 'exit');
			}
		}

		function addEndpointMarker(node: MapNode, kind: 'start' | 'goal' | 'start-goal') {
			if (!leaflet) return;
			const label =
				kind === 'start' ? 'スタート' : kind === 'goal' ? 'ゴール' : 'スタート / ゴール';
			const symbol = document.createElement('span');
			symbol.className = 'route-endpoint-symbol';
			if (kind === 'start-goal') {
				symbol.style.background = `linear-gradient(135deg, ${highlightColors.start.stroke} 50%, ${highlightColors.goal.stroke} 50%)`;
				symbol.textContent = 'S/G';
			} else {
				symbol.style.backgroundColor = highlightColors[kind].stroke;
				if (kind === 'start') {
					symbol.textContent = 'S';
				} else {
					const flag = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
					flag.classList.add('route-transition-icon');
					flag.setAttribute('viewBox', '0 0 24 24');
					const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
					path.setAttribute('d', 'M5 21V3M5 4h14l-3 4 3 4H5');
					flag.appendChild(path);
					symbol.appendChild(flag);
				}
			}
			symbol.setAttribute('aria-hidden', 'true');
			const marker = leaflet.marker([node.y, node.x], {
				icon: leaflet.divIcon({
					html: symbol,
					className: `route-endpoint-marker route-endpoint-${kind}`,
					iconSize: [36, 36],
					iconAnchor: [18, 18]
				}),
				title: label,
				alt: label,
				keyboard: false,
				interactive: false,
				zIndexOffset: 2000
			});
			routeBuildingByLayer.set(marker, getNodeBuildingId(node));
			const text = document.createElement('span');
			text.textContent = label;
			marker.bindTooltip(text, {
				permanent: true,
				direction: 'top',
				offset: [0, -20],
				className: 'route-endpoint-label',
				opacity: 1
			});
			const markers = routeMarkersByFloor[node.floor] ?? [];
			markers.push(marker);
			routeMarkersByFloor[node.floor] = markers;
		}

		const start = segments[0][0];
		const goal = segments[segments.length - 1].at(-1)!;
		if (start.id === goal.id) {
			addEndpointMarker(start, 'start-goal');
		} else {
			addEndpointMarker(start, 'start');
			addEndpointMarker(goal, 'goal');
		}

		pendingRoutePath = null;
		const buildingId = start.buildingId ?? /^node_(.+)_f-?\d+_/.exec(start.id)?.[1];
		switchFloor(buildingId ?? zoomedBldg, start.floor);
		fitCurrentFloorRoute();
	}

	export function clearRoute() {
		for (const layers of Object.values(routeLayersByFloor)) {
			for (const layer of layers ?? []) layer.remove();
		}
		for (const markers of Object.values(routeMarkersByFloor)) {
			for (const marker of markers ?? []) marker.remove();
		}
		routeLayersByFloor = {};
		routeMarkersByFloor = {};
		routePointsByFloor = {};
		pendingRoutePath = null;
	}

	export function showRoute(startId: string, goalId: string): string[] | null {
		const pathIds = aStar(graph, startId, goalId);
		if (!pathIds) {
			clearRoute();
			console.error(`経路が見つかりません: ${startId} -> ${goalId}`);
			return null;
		}

		drawRoute(pathIds);
		return pathIds;
	}

	async function loadSvgOverlay(
		url: string,
		bounds: LType.LatLngBoundsExpression,
		L: typeof LType
	) {
		const response = await fetch(url);
		if (!response.ok) throw new Error(`SVGの取得に失敗しました: ${url}`);
		const svgText = await response.text();
		const parser = new DOMParser();
		const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
		const svgElement = svgDoc.documentElement as unknown as SVGElement;
		const layer = L.svgOverlay(svgElement, bounds, { interactive: true });
		svgElementsByLayer.set(layer, svgElement);
		return layer;
	}

	function updateVisibleFloor() {
		if (!map) return;
		const nextLayers = new Set(
			visibleBuildings.flatMap(({ id }) => {
				const layer = buildingFloorLayers[id]?.[activeFloors[id]];
				const svg = layer ? svgElementsByLayer.get(layer) : undefined;
				svg?.style.setProperty('--building-outline-color', buildingOutlineColors[id]);
				svg?.style.setProperty('--building-outline-blur', `${3 / 2 ** map.getZoom()}px`);
				return layer ? [layer] : [];
			})
		);
		for (const layer of visibleFloorLayers) {
			if (!nextLayers.has(layer)) {
				layer.remove();
				visibleFloorLayers.delete(layer);
			}
		}
		for (const [buildingId, layer] of Object.entries(overviewLayers)) {
			if (visibleBuildings.some(({ id }) => id === buildingId)) {
				layer.remove();
			} else if (!map.hasLayer(layer)) {
				layer.addTo(map);
			}
		}
		for (const layer of nextLayers) {
			if (!map.hasLayer(layer)) layer.addTo(map);
			visibleFloorLayers.add(layer);
		}
	}

	function setVisibleBuildings(buildings: BuildingMap[]) {
		// 移動で近い順が変わっても、表示を続ける建物の色は維持します。
		const retained = buildings.filter(({ id }) =>
			visibleBuildings.some((building) => building.id === id)
		);
		const added = buildings.filter(({ id }) => !retained.some((building) => building.id === id));
		const usedColors: string[] = [];
		for (const { id } of [...retained, ...added]) {
			const previousColor = buildingOutlineColors[id];
			const color =
				previousColor && !usedColors.includes(previousColor)
					? previousColor
					: buildingOutlinePalette.find((candidate) => !usedColors.includes(candidate))!;
			buildingOutlineColors[id] = color;
			usedColors.push(color);
		}
		visibleBuildings = buildings;
		for (const { id } of buildings) {
			if (activeFloors[id] === undefined) {
				activeFloors[id] = buildingFloorLayers[id]?.[activeFloor] ? activeFloor : 1;
			}
		}
		if (!buildings.some(({ id }) => id === zoomedBldg)) zoomedBldg = buildings[0]?.id ?? '';
		if (zoomedBldg) activeFloor = activeFloors[zoomedBldg];
		showBldgMenu = buildings.length > 0;
	}

	function switchFloor(buildingId: string, floor: number) {
		if (!map) return;
		const layers = buildingFloorLayers[buildingId];
		zoomedBldg = layers ? buildingId : '';
		// 建物を移動したとき、存在しない階のまま空白になることを防ぎます。
		activeFloor = layers && !layers[floor] ? 1 : floor;
		if (layers) {
			activeFloors[buildingId] = activeFloor;
			if (!visibleBuildings.some(({ id }) => id === buildingId)) {
				const building = buildingMaps.find(({ id }) => id === buildingId)!;
				const [left, top, right, bottom] = building.bounds;
				const nearby = getNearbyBuildings(buildingMaps, (left + right) / 2, (top + bottom) / 2);
				setVisibleBuildings(
					[building, ...nearby.filter(({ id }) => id !== buildingId)].slice(0, 2)
				);
			}
		} else {
			setVisibleBuildings([]);
		}
		updateVisibleFloor();
		updateVisibleRoute();
		updateVisiblePoi();
	}

	/*
	=======
	移動関数
	=======
	*/

	// 座標を指定された地点へ移動する
	function focusOnLocation(x: number, y: number, zoom: number = 3) {
		if (!map) {
			console.error('マップが初期化されていません');
			return;
		}

		map.flyTo([y, x], zoom, { duration: 1.0 });
	}

	// POIのidから目的地を探し、その座標へ移動する
	export function focusOnPoiId(targetPoiId: string) {
		const targetPoi = pois.find((poi) => poi.id === targetPoiId);
		if (!targetPoi) {
			console.error(`エラー: ${targetPoiId} という目的地が見つかりません`);
			return;
		}

		const targetNode = nodes.find((node) => node.id === targetPoi.nodeId);
		if (!targetNode) {
			console.error(`エラー: ノードID ${targetPoi.nodeId} の座標データが見つかりません`);
			return;
		}

		const buildingId = targetNode.buildingId ?? /^node_(.+)_f-?\d+_/.exec(targetNode.id)?.[1];
		switchFloor(buildingId ?? '', targetNode.floor);
		focusOnLocation(targetNode.x, targetNode.y, 2);
	}

	onMount(() => {
		for (const [role, colors] of Object.entries(highlightColors)) {
			for (const [property, value] of Object.entries(colors)) {
				mapContainer.style.setProperty(`--poi-${role}-${property}`, value);
			}
		}
		let disposed = false;
		const initMap = async () => {
			const L = await import('leaflet');
			if (disposed) return;
			leaflet = L;

			const bounds: LType.LatLngBoundsExpression = [
				[0, 0],
				[1700, 1400]
			];

			map = L.map(mapContainer, {
				crs: L.CRS.Simple,
				minZoom: -1,
				maxZoom: 2,
				zoomControl: true,
				maxBounds: bounds,
				maxBoundsViscosity: 1.0
			});

			for (const [name, zIndex] of [
				['floor-maps', 420],
				['route-lines', 430]
			] as const) {
				map.createPane(name).style.zIndex = String(zIndex);
			}
			const SHOW_UI_ZOOM_THRESHOLD = 0;

			try {
				const mapFiles = [
					...new Set([
						...baseMapFiles,
						...buildingMaps.flatMap((building) => [
							...Object.values(building.floors),
							...(building.overview ? [building.overview] : [])
						])
					])
				];
				const loadedLayers = new Map(
					await Promise.all(
						mapFiles.map(
							async (file) => [file, await loadSvgOverlay(`/maps/${file}`, bounds, L)] as const
						)
					)
				);
				if (disposed) return;

				for (const file of baseMapFiles) loadedLayers.get(file)!.addTo(map);
				for (const building of buildingMaps) {
					if (building.overview) {
						// 同じSVGを0Fでも使う場合も、全体図と階別図のレイヤーを分けます。
						const svg = svgElementsByLayer.get(loadedLayers.get(building.overview)!)!;
						overviewLayers[building.id] = L.svgOverlay(svg.cloneNode(true) as SVGElement, bounds);
					}
					const layers: Partial<Record<number, LType.SVGOverlay>> = {};
					for (const [floor, file] of Object.entries(building.floors)) {
						const layer = loadedLayers.get(file)!;
						layer.options.pane = 'floor-maps';
						const svg = svgElementsByLayer.get(layer)!;
						const outline = svg.querySelector('[id$="_flame"]');
						if (outline) {
							const border = outline.cloneNode(true) as SVGElement;
							border.removeAttribute('id');
							border.setAttribute('aria-hidden', 'true');
							border.classList.add('building-floor-outline');
							// 壁の線は上に残し、輪郭の周囲だけに柔らかな色を広げます。
							outline.before(border);
						}
						layers[Number(floor)] = layer;
						enablePoiSelection(layer, building.id, Number(floor));
					}
					buildingFloorLayers[building.id] = layers;
				}
				svgLayersReady = true;

				const updateMapState = () => {
					const center = map.getCenter();
					setVisibleBuildings(
						map.getZoom() >= SHOW_UI_ZOOM_THRESHOLD
							? getNearbyBuildings(buildingMaps, center.lng, 1700 - center.lat)
							: []
					);
					updateVisibleFloor();
					updateVisibleRoute();
					updateVisiblePoi();
				};

				map.on('zoomend moveend', updateMapState);
				map.fitBounds(bounds);
				updateMapState();

				if (pendingRoutePath) drawRoute(pendingRoutePath);
				for (const [color, request] of Object.entries(pendingPoiHighlights)) {
					applyPoiHighlight(request.poiId, color as HighlightColor, request.focus);
				}
			} catch (error) {
				console.error('マップの初期化エラー:', error);
			}
		};

		initMap();

		return () => {
			disposed = true;
			clearRoute();
			clearPoiHighlight();
			for (const cleanup of poiSelectionCleanups) cleanup();
			svgLayersReady = false;
			if (map) map.remove();
			leaflet = undefined;
		};
	});
</script>

<div class="map-wrapper">
	<div bind:this={mapContainer} class="map-container"></div>

	{#if showBldgMenu}
		<div class="building-controls">
			{#each visibleBuildings as building (building.id)}
				<section
					class="custom-control-panel"
					style:--building-outline-color={buildingOutlineColors[building.id]}
					data-building={building.id}
					aria-label={`${building.name}の階`}
				>
					<h3>{building.name}</h3>
					<div class="floor-buttons">
						{#each Object.keys(building.floors)
							.map(Number)
							.sort((a, b) => b - a) as floor (floor)}
							<button
								class:active={activeFloors[building.id] === floor}
								aria-pressed={activeFloors[building.id] === floor}
								onclick={() => switchFloor(building.id, floor)}
							>
								{floor < 0 ? `B${-floor}` : `${floor}F`}
							</button>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	{/if}
</div>

<style>
	/* 重ねたSVGの透明な部分は、下にある建物のタップを遮らないようにします。 */
	:global(.leaflet-floor-maps-pane > svg) {
		pointer-events: none !important;
	}

	:global(.building-floor-outline) {
		fill: none !important;
		stroke: var(--building-outline-color, #2563eb) !important;
		stroke-width: 6;
		stroke-linejoin: round;
		opacity: 0.65;
		filter: blur(var(--building-outline-blur, 3px));
		vector-effect: non-scaling-stroke;
		pointer-events: none !important;
	}

	:global(.poi-color-start) {
		--poi-highlight-fill: var(--poi-start-fill);
		--poi-highlight-stroke: var(--poi-start-stroke);
		--poi-highlight-text: var(--poi-start-text);
	}

	:global(.poi-color-goal) {
		--poi-highlight-fill: var(--poi-goal-fill);
		--poi-highlight-stroke: var(--poi-goal-stroke);
		--poi-highlight-text: var(--poi-goal-text);
	}

	:global(.poi-color-selected) {
		--poi-highlight-fill: var(--poi-selected-fill);
		--poi-highlight-stroke: var(--poi-selected-stroke);
		--poi-highlight-text: var(--poi-selected-text);
	}

	:global(.poi-selectable),
	:global(.poi-selectable *) {
		cursor: pointer;
		/* Leafletのpath設定を上書きし、塗りなしの部屋も内部から選択できます。 */
		pointer-events: all !important;
	}

	:global(.poi-highlight),
	:global(.poi-highlight :is(path, rect, polygon, circle, ellipse, polyline)) {
		fill: var(--poi-highlight-fill, #fbbf24) !important;
		fill-opacity: 0.6;
		stroke: var(--poi-highlight-stroke, #b45309) !important;
		stroke-width: 3;
		vector-effect: non-scaling-stroke;
	}

	:global(.poi-name-tooltip) {
		border: 1px solid var(--poi-highlight-stroke, #b45309);
		border-radius: 8px;
		padding: 8px 12px;
		color: var(--poi-highlight-text, #78350f);
		font-size: 14px;
		font-weight: bold;
		width: max-content;
		max-width: 240px;
		white-space: normal;
		text-align: center;
	}

	:global(.poi-name-tooltip.leaflet-tooltip-top::before) {
		border-top-color: var(--poi-highlight-stroke, #b45309);
	}

	:global(.route-endpoint-symbol) {
		display: flex;
		width: 100%;
		height: 100%;
		align-items: center;
		justify-content: center;
		border: 2px solid white;
		border-radius: 50%;
		color: white;
		font-size: 14px;
		font-weight: bold;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
	}

	:global(.route-endpoint-label) {
		border-radius: 6px;
		padding: 5px 9px;
		font-size: 12px;
		font-weight: bold;
	}

	:global(.route-transition-marker) {
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px solid white;
		border-radius: 50%;
		background: #2563eb;
		color: white;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
	}

	:global(.route-transition-icon) {
		display: block;
		width: 22px;
		height: 22px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	:global(.route-transition-exit) {
		background: #0f766e;
	}

	:global(.route-transition-label) {
		border: 1px solid #2563eb;
		border-radius: 6px;
		padding: 6px 10px;
		color: #1e3a8a;
		font-size: 13px;
		font-weight: bold;
	}

	:global(.route-transition-label-exit) {
		border-color: #0f766e;
		color: #115e59;
	}

	.map-wrapper {
		position: relative;
		width: 100%;
		height: 600px;
		border-radius: 8px;
		overflow: hidden;
	}

	.map-container {
		width: 100%;
		height: 100%;
		background-color: #f0f0f0;
		z-index: 1;
	}

	.building-controls {
		position: absolute;
		bottom: 20px;
		left: 20px;
		z-index: 1000;
		display: flex;
		align-items: flex-end;
		gap: 12px;
		max-width: calc(100% - 40px);
	}

	.custom-control-panel {
		background: rgba(255, 255, 255, 0.95);
		border-top: 4px solid var(--building-outline-color);
		padding: 16px;
		border-radius: 12px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		backdrop-filter: blur(4px);
		transition: opacity 0.3s ease;
	}

	.custom-control-panel h3 {
		margin: 0 0 12px 0;
		font-size: 14px;
		color: var(--building-outline-color, #333);
		text-align: center;
	}

	.floor-buttons {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.floor-buttons button {
		padding: 8px 18px;
		border: 1px solid #ccc;
		background: white;
		border-radius: 6px;
		cursor: pointer;
		font-weight: bold;
		transition: all 0.2s;
	}

	.floor-buttons button:hover {
		background: #f8f9fa;
	}

	.floor-buttons button.active {
		background: var(--building-outline-color, #2563eb);
		color: white;
		border-color: var(--building-outline-color, #2563eb);
	}
</style>
