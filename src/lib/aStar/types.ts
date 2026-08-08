export type MapNode = {
	id: string;
	floor: number;
	x: number;
	y: number;
};

export type RawMapEdge = {
	fromNode: string;
	toNode: string;
	isStairs: boolean;
};

export type MapEdge = {
	id: string;
	fromNode: string;
	toNode: string;
	isStairs: boolean;
	weight: number;
};

export type POI = {
	id: string;
	name: string;
	categoryId: string;
	nodeId: string;
	svgId: string;
	description: string;
};
