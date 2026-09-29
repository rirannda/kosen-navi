export type Edge = {
	fromNode: string;
	toNode: string;
	isStairs: boolean;
};
export type Edges = Edge[];

export type Node = {
	id: string;
	floor: number;
	x: number;
	y: number;
};
export type Nodes = Node[];

export type Poi = {
	id: string;
	name: string;
	categoryId: string;
	nodeId: string;
	svgId: string;
	description: string;
};
export type Pois = Poi[];
