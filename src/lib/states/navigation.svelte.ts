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
	let highlights = $state.raw<PoiHighlights>({});
	let routePath = $state.raw<readonly string[] | null>(null);

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
		const path = aStar(graph, startId, goalId);
		routePath = path ? [...path] : null;
		if (!path) console.error(`経路が見つかりません: ${startId} -> ${goalId}`);
		return path;
	}

	return {
		graph,
		pois: poiData,
		resolvePoi,
		setHighlight,
		clearHighlight,
		showRoute,
		clearRoute: () => {
			routePath = null;
		},
		get highlights() {
			return highlights;
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
