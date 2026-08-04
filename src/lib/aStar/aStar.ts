import { MapEdge, MapNode } from './types';

export function aStar(
	graph: {
		nodes: MapNode[];
		edges: MapEdge[];
	},
	startId: string,
	goalId: string
): string[] | null {
	const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));

	const adjacency = new Map<string, { to: string; cost: number }[]>();

	// 隣接リスト初期化
	for (const node of graph.nodes) {
		adjacency.set(node.id, []);
	}

	// 双方向グラフ
	for (const edge of graph.edges) {
		adjacency.get(edge.fromNode)!.push({
			to: edge.toNode,
			cost: edge.weight
		});

		adjacency.get(edge.toNode)!.push({
			to: edge.fromNode,
			cost: edge.weight
		});
	}

	const heuristic = (a: string, b: string) => {
		const na = nodeMap.get(a)!;
		const nb = nodeMap.get(b)!;

		return Math.hypot(na.x - nb.x, na.y - nb.y);
	};

	const open = new Set([startId]);

	const cameFrom = new Map<string, string>();

	const gScore = new Map<string, number>();

	const fScore = new Map<string, number>();

	for (const node of graph.nodes) {
		gScore.set(node.id, Infinity);
		fScore.set(node.id, Infinity);
	}

	gScore.set(startId, 0);

	fScore.set(startId, heuristic(startId, goalId));

	while (open.size > 0) {
		let current = '';

		let best = Infinity;

		for (const id of open) {
			const score = fScore.get(id)!;

			if (score < best) {
				best = score;
				current = id;
			}
		}

		if (current === goalId) {
			const path = [current];

			while (cameFrom.has(current)) {
				current = cameFrom.get(current)!;
				path.unshift(current);
			}

			return path;
		}

		open.delete(current);

		for (const next of adjacency.get(current)!) {
			const tentative = gScore.get(current)! + next.cost;

			if (tentative < gScore.get(next.to)!) {
				cameFrom.set(next.to, current);

				gScore.set(next.to, tentative);

				fScore.set(next.to, tentative + heuristic(next.to, goalId));

				open.add(next.to);
			}
		}
	}

	return null;
}
