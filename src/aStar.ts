type MapNode = {
	id: string;
	buildingId: string;
	floor: number;
	x: number;
	y: number;
};

type MapEdge = {
	id: string;
	fromNode: string;
	toNode: string;
	weight: number;
	type: 'hall' | 'stairs' | 'elevator' | 'bridge' | 'outdoor';
	bidirectional: boolean;
};

type Graph = {
	nodes: MapNode[];
	edges: MapEdge[];
};

export function aStar(graph: Graph, startId: string, goalId: string): string[] | null {
	const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

	// 隣接リスト作成
	const adjacency = new Map<string, { to: string; cost: number }[]>();

	for (const edge of graph.edges) {
		if (!adjacency.has(edge.fromNode)) adjacency.set(edge.fromNode, []);
		adjacency.get(edge.fromNode)!.push({
			to: edge.toNode,
			cost: edge.weight
		});

		if (edge.bidirectional) {
			if (!adjacency.has(edge.toNode)) adjacency.set(edge.toNode, []);
			adjacency.get(edge.toNode)!.push({
				to: edge.fromNode,
				cost: edge.weight
			});
		}
	}

	const heuristic = (a: string, b: string) => {
		const na = nodeMap.get(a)!;
		const nb = nodeMap.get(b)!;

		const dx = na.x - nb.x;
		const dy = na.y - nb.y;

		// 階が違う場合は少しコスト追加
		const floorPenalty = Math.abs(na.floor - nb.floor) * 100;

		return Math.sqrt(dx * dx + dy * dy) + floorPenalty;
	};

	const openSet = new Set<string>([startId]);

	const cameFrom = new Map<string, string>();

	const gScore = new Map<string, number>();
	const fScore = new Map<string, number>();

	for (const node of graph.nodes) {
		gScore.set(node.id, Infinity);
		fScore.set(node.id, Infinity);
	}

	gScore.set(startId, 0);
	fScore.set(startId, heuristic(startId, goalId));

	while (openSet.size > 0) {
		// fScore最小を取得
		let current = '';
		let best = Infinity;

		for (const id of openSet) {
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

		openSet.delete(current);

		const neighbors = adjacency.get(current) ?? [];

		for (const neighbor of neighbors) {
			const tentative = gScore.get(current)! + neighbor.cost;

			if (tentative < gScore.get(neighbor.to)!) {
				cameFrom.set(neighbor.to, current);

				gScore.set(neighbor.to, tentative);

				fScore.set(neighbor.to, tentative + heuristic(neighbor.to, goalId));

				openSet.add(neighbor.to);
			}
		}
	}

	return null;
}
