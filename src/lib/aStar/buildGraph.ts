import { MapEdge, MapNode, RawMapEdge } from './types';

export function buildGraph(nodes: MapNode[], rawEdges: RawMapEdge[]) {
	const nodeMap = new Map(nodes.map((node) => [node.id, node]));

	const edges: MapEdge[] = rawEdges.map((edge) => {
		const from = nodeMap.get(edge.fromNode);
		const to = nodeMap.get(edge.toNode);

		if (!from || !to) {
			throw new Error(`Node not found: ${edge.fromNode} -> ${edge.toNode}`);
		}

		return {
			id: `${edge.fromNode}_to_${edge.toNode}`,
			fromNode: edge.fromNode,
			toNode: edge.toNode,
			isStairs: edge.isStairs,
			weight: Math.hypot(from.x - to.x, from.y - to.y)
		};
	});

	return {
		nodes,
		edges
	};
}
