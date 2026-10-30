import { aStar } from '../aStar/aStar';
import { buildGraph } from '../aStar/buildGraph';
import { nodes } from '../../data/nodes';
import { edges } from '../../data/edges';
import { edgeStairs } from '../../data/edge_stair';
import { pois } from '../../data/pois';
import type { Node, Poi, EnhancedEdge } from '../../data/types';
import type { HighlightColor } from '../map/highlightColors';
import { highlightRoles } from '../map/highlightColors';
import { SvelteMap } from 'svelte/reactivity';
import { getContext, hasContext, setContext } from 'svelte';

export type PoiHighlights = Readonly<Partial<Record<HighlightColor, string>>>;
export type NavigationData = {
	graph: { nodes: Node[]; edges: EnhancedEdge[] };
	pois: readonly Poi[];
};

/** ページごとに生成する共有状態。描画先やカメラ位置には依存しません。 */
export function createNavigationState(data?: NavigationData) {
	const graph = data?.graph ?? buildGraph(nodes, edges, edgeStairs);
	const poiData = data?.pois ?? pois;
	const poiById = new SvelteMap(poiData.map((poi) => [poi.id, poi]));
	const nodeById = new SvelteMap(graph.nodes.map((node) => [node.id, node]));
	const defaultStart = poiById.get('poi_hr_2i');
	let highlights = $state.raw<PoiHighlights>(
		defaultStart && nodeById.has(defaultStart.nodeId) ? { start: defaultStart.id } : {}
	);
	let routePath = $state.raw<readonly string[] | null>(null);
	let focusRequest = $state.raw<{ poiId: string; showFloor: boolean } | null>(null);
	let barrierFree = $state(false);
	let routeError = $state<string | null>(null);
	let routeErrorVersion = $state(0);
	let routeRequest: { startId: string; goalId: string } | null = null;

	function resolvePoi(poiId: string): { poi: Poi; node: Node } | undefined {
		const poi = poiById.get(poiId);
		const node = poi ? nodeById.get(poi.nodeId) : undefined;
		return poi && node ? { poi, node } : undefined;
	}

	function setHighlight(poiId: string, role: HighlightColor = 'selected'): boolean {
		if (!highlightRoles.includes(role) || !resolvePoi(poiId)) return false;
		if (highlights[role] !== poiId) highlights = { ...highlights, [role]: poiId };
		return true;
	}

	function clearHighlight(role?: HighlightColor): void {
		if (role !== undefined && !highlightRoles.includes(role)) return;
		if (!role) {
			highlights = {};
		} else if (highlights[role] !== undefined) {
			const next = { ...highlights };
			delete next[role];
			highlights = next;
		}
	}

	function showRoute(startId: string, goalId: string): string[] | null {
		routeRequest = { startId, goalId };
		const path = aStar(graph, startId, goalId, { avoidStairs: barrierFree });
		routePath = path ? [...path] : null;
		routeError = path
			? null
			: barrierFree
				? '階段を使わない経路が見つかりません。条件を変更してください。'
				: '選択した場所を結ぶ経路が見つかりません。';
		if (!path) {
			routeErrorVersion += 1;
			console.error(`経路が見つかりません: ${startId} -> ${goalId}`);
		}
		return path;
	}

	return {
		graph,
		pois: poiData,
		resolvePoi,
		setHighlight,
		clearHighlight,
		showRoute,
		setBarrierFree: (enabled: boolean) => {
			if (barrierFree === enabled) return;
			barrierFree = enabled;
			if (routeRequest) showRoute(routeRequest.startId, routeRequest.goalId);
		},
		/** POIへの移動と、必要に応じて階別表示を依頼します。同じPOIでも再実行します。 */
		requestFocus: (poiId: string, options: { showFloor?: boolean } = {}) => {
			focusRequest = { poiId, showFloor: options.showFloor ?? false };
		},
		clearRoute: () => {
			routePath = null;
			routeRequest = null;
			routeError = null;
		},
		get barrierFree() {
			return barrierFree;
		},
		get routeError() {
			return routeError;
		},
		get routeErrorVersion() {
			return routeErrorVersion;
		},
		get highlights() {
			return highlights;
		},
		get focusRequest() {
			return focusRequest;
		},
		get routePath() {
			return routePath;
		},
		get selectedPoi() {
			return highlights.selected ? (poiById.get(highlights.selected) ?? null) : null;
		}
	};
}

export type NavigationState = ReturnType<typeof createNavigationState>;

const navigationKey = Symbol('navigation');

/** ページ配下のコンポーネントがpropsなしで共有できるよう、状態をcontextへ登録します。 */
export function provideNavigation(navigation = createNavigationState()): NavigationState {
	setContext(navigationKey, navigation);
	return navigation;
}

export function getNavigation(): NavigationState | undefined {
	return hasContext(navigationKey) ? getContext<NavigationState>(navigationKey) : undefined;
}

export function requireNavigation(): NavigationState {
	const navigation = getNavigation();
	if (!navigation) throw new Error('provideNavigation()で共有状態を登録してください');
	return navigation;
}
