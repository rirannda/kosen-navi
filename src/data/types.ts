export type Edge = {
	fromNode: string;
	toNode: string;
	isStairs: boolean;
};
export type Edges = Edge[];

export type Node = {
	id: string;
	buildingId?: string; // 省略時は既存のノードID命名規則から判定
	floor: number;
	x: number;
	y: number;
};
export type Nodes = Node[];

export type EnhancedEdge = {
	id: string;
	fromNode: string;
	toNode: string;
	isStairs: boolean;
	weight: number;
};

export type Poi = {
	id: string;
	name: string;
	categoryId: string;
	nodeId: string;
	svgId: string;
	description: string;
	keys?: string[];
};
export type Pois = Poi[];
