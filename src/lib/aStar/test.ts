import nodes from './data/nodes.json';
import rawEdges from './data/edges.json';
import pois from './data/pois.json';
import { buildGraph } from './buildGraph.ts';
import { aStar } from './aStar.ts';

const graph = buildGraph(nodes, rawEdges);

const start = pois.find((p) => p.id === 'poi_hr_1-1');
if (!start) {
	throw new Error('Not Found Start');
}
const goal = pois.find((p) => p.id === 'poi_hr_1-4');
if (!goal) {
	throw new Error('Not Found Start');
}

const path = aStar(graph, start.nodeId, goal.nodeId);

console.log(start);
console.log(path);
