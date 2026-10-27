import { describe, expect, it } from 'vitest';
import type { BuildingMap } from '../../../data/maps';
import { buildingMaps } from '../../../data/maps';
import { nodes } from '../../../data/nodes';
import { edges } from '../../../data/edges';
import { edgeStairs } from '../../../data/edge_stair';
import { createConnectedFloorLookup } from '../connectedFloors';
import { createBuildingConnections, getFocusedBuildings } from '../focusedBuildings';

const building = (id: string, bounds: BuildingMap['bounds']): BuildingMap => ({
	id,
	name: id,
	bounds,
	floors: { 1: `${id}.svg` }
});
const ids = (buildings: readonly BuildingMap[]) => buildings.map(({ id }) => id);

describe('getFocusedBuildings', () => {
	it('中心から最も近い実際の輪郭を起点にし、L字の空白を建物内と判定しない', () => {
		const buildings = [building('corridor', [0, 0, 100, 100]), building('room', [52, 45, 62, 55])];
		const outlines = new Map([
			[
				'corridor',
				[
					{ x: 0, y: 0 },
					{ x: 10, y: 0 },
					{ x: 10, y: 90 },
					{ x: 100, y: 90 },
					{ x: 100, y: 100 },
					{ x: 0, y: 100 }
				]
			]
		]);
		expect(ids(getFocusedBuildings(buildings, { x: 50, y: 50 }, new Map(), outlines, 1))).toEqual([
			'room'
		]);
	});

	it('建物の中心点同士ではなく、起点の枠から近い順で選ぶ', () => {
		const buildings = [
			building('root', [0, 0, 200, 10]),
			building('near-center', [0, 15, 10, 25]),
			building('touching-edge', [190, 10, 210, 20])
		];
		expect(ids(getFocusedBuildings(buildings, { x: 1, y: 5 }, new Map()))).toEqual([
			'root',
			'touching-edge',
			'near-center'
		]);
	});

	it('近くても未接続の建物より、表示中の建物から接続が続く候補を優先する', () => {
		const buildings = [
			building('root', [0, 0, 10, 10]),
			building('unconnected', [12, 0, 18, 10]),
			building('destination', [20, 0, 30, 10]),
			building('bridge', [100, 0, 110, 10])
		];
		const connections = new Map([
			['root', new Set(['bridge'])],
			['bridge', new Set(['root', 'destination'])],
			['destination', new Set(['bridge'])]
		]);
		expect(ids(getFocusedBuildings(buildings, { x: 5, y: 5 }, connections, new Map(), 3))).toEqual([
			'root',
			'bridge',
			'destination'
		]);
	});

	it('最大6棟に抑え、候補が少なければ無関係な建物を追加しない', () => {
		const buildings = Array.from({ length: 9 }, (_, index) =>
			building(`b${index}`, [index * 20, 0, index * 20 + 10, 10])
		);
		expect(ids(getFocusedBuildings(buildings, { x: 5, y: 5 }, new Map()))).toEqual([
			'b0',
			'b1',
			'b2',
			'b3',
			'b4',
			'b5'
		]);
		expect(getFocusedBuildings(buildings.slice(0, 2), { x: 5, y: 5 }, new Map()).length).toBe(2);
		expect(getFocusedBuildings([], { x: 0, y: 0 }, new Map())).toEqual([]);
		expect(getFocusedBuildings(buildings, { x: 0, y: 0 }, new Map(), new Map(), 0)).toEqual([]);
	});

	it('同距離の候補はデータの入力順を変えても同じ順序で選ぶ', () => {
		const buildings = [
			building('root', [0, 0, 10, 10]),
			building('alpha', [-20, 0, -10, 10]),
			building('beta', [20, 0, 30, 10])
		];
		expect(ids(getFocusedBuildings(buildings, { x: 5, y: 5 }, new Map()))).toEqual(
			ids(getFocusedBuildings(buildings.toReversed(), { x: 5, y: 5 }, new Map()))
		);
	});
});

describe('createBuildingConnections', () => {
	it('既存の経路から棟の接続を得て、屋外経由で全棟を接続扱いにしない', () => {
		const connections = createBuildingConnections(
			buildingMaps,
			createConnectedFloorLookup(nodes, [...edges, ...edgeStairs])
		);
		expect(connections.get('la')?.has('skybridge')).toBe(true);
		expect(connections.get('skybridge')?.has('la')).toBe(true);
		expect(connections.get('staircase')?.has('ss1')).toBe(true);
		expect(connections.get('staircase')?.has('ss2')).toBe(true);
		expect(connections.get('cepc')?.has('ss1')).toBe(true);
		expect(connections.get('gym')?.size).toBe(0);
		expect(connections.has('outdoor')).toBe(false);
	});

	it('非公開の階にしか接続しない建物同士は接続扱いにしない', () => {
		const buildings = [building('alpha', [0, 0, 10, 10]), building('beta', [20, 0, 30, 10])];
		const lookup = createConnectedFloorLookup(
			[
				{ id: 'a', buildingId: 'alpha', floor: 1, x: 0, y: 0 },
				{ id: 'b', buildingId: 'beta', floor: 2, x: 0, y: 0 }
			],
			[{ fromNode: 'a', toNode: 'b', isStairs: false }]
		);
		expect(createBuildingConnections(buildings, lookup).get('alpha')?.size).toBe(0);
	});
});
