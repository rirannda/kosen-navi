import type { BuildingMap } from '../../data/maps';
import type { ConnectedFloorLookup } from './connectedFloors';

export type BuildingFocusPoint = { x: number; y: number };
export type BuildingConnections = ReadonlyMap<string, ReadonlySet<string>>;
const simplifiedOutlines = new WeakMap<
	readonly BuildingFocusPoint[],
	readonly BuildingFocusPoint[]
>();

/** 公開されている階を実際に結ぶ経路だけから、建物同士の接続を一度索引化します。 */
export function createBuildingConnections(
	buildings: readonly BuildingMap[],
	getConnectedFloor: ConnectedFloorLookup
): BuildingConnections {
	const connections = new Map(buildings.map(({ id }) => [id, new Set<string>()]));
	for (let index = 0; index < buildings.length; index++) {
		const source = buildings[index];
		for (const target of buildings.slice(index + 1)) {
			const connected = Object.keys(source.floors)
				.map(Number)
				.some((floor) =>
					Object.keys(target.floors)
						.map(Number)
						.some(
							(targetFloor) =>
								getConnectedFloor(source.id, floor, target.id, targetFloor) === targetFloor
						)
				);
			if (connected) {
				connections.get(source.id)!.add(target.id);
				connections.get(target.id)!.add(source.id);
			}
		}
	}
	return connections;
}

function pointDistance(
	point: BuildingFocusPoint,
	a: BuildingFocusPoint,
	b: BuildingFocusPoint
): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const length = dx * dx + dy * dy;
	const t = length
		? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length))
		: 0;
	return (point.x - a.x - t * dx) ** 2 + (point.y - a.y - t * dy) ** 2;
}

function vertices(points: readonly BuildingFocusPoint[]): readonly BuildingFocusPoint[] {
	if (points.length <= 4) return points;
	const cached = simplifiedOutlines.get(points);
	if (cached) return cached;
	const reduced = [points[0]];
	// 直線上のサンプルを省き、移動のたびに大量の点同士を比較しないようにします。
	for (let index = 1; index < points.length - 1; index++) {
		if (pointDistance(points[index], reduced.at(-1)!, points[index + 1]) > 0.01)
			reduced.push(points[index]);
	}
	reduced.push(points.at(-1)!);
	simplifiedOutlines.set(points, reduced);
	return reduced;
}

function contains(polygon: readonly BuildingFocusPoint[], point: BuildingFocusPoint): boolean {
	let inside = false;
	for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
		const a = polygon[index],
			b = polygon[previous];
		if (
			a.y > point.y !== b.y > point.y &&
			point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
		)
			inside = !inside;
	}
	return inside;
}

function centerDistance(
	polygon: readonly BuildingFocusPoint[],
	center: BuildingFocusPoint
): number {
	if (contains(polygon, center)) return 0;
	return Math.min(
		...polygon.map((point, index) =>
			pointDistance(center, point, polygon[(index + 1) % polygon.length])
		)
	);
}

function segmentDistance(
	a: BuildingFocusPoint,
	b: BuildingFocusPoint,
	c: BuildingFocusPoint,
	d: BuildingFocusPoint
): number {
	const cross = (p: BuildingFocusPoint, q: BuildingFocusPoint, r: BuildingFocusPoint) =>
		(q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
	if (
		Math.max(a.x, b.x) >= Math.min(c.x, d.x) &&
		Math.max(c.x, d.x) >= Math.min(a.x, b.x) &&
		Math.max(a.y, b.y) >= Math.min(c.y, d.y) &&
		Math.max(c.y, d.y) >= Math.min(a.y, b.y) &&
		cross(a, b, c) * cross(a, b, d) <= 0 &&
		cross(c, d, a) * cross(c, d, b) <= 0
	)
		return 0;
	return Math.min(
		pointDistance(a, c, d),
		pointDistance(b, c, d),
		pointDistance(c, a, b),
		pointDistance(d, a, b)
	);
}

function outlineDistance(
	a: readonly BuildingFocusPoint[],
	b: readonly BuildingFocusPoint[]
): number {
	let distance = Infinity;
	for (let i = 0; i < a.length; i++) {
		for (let j = 0; j < b.length; j++) {
			distance = Math.min(
				distance,
				segmentDistance(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])
			);
			if (distance === 0) return 0;
		}
	}
	return distance;
}

/** 中心に最も近い建物を起点とし、接続を優先してその輪郭から近い順に最大6棟を選びます。 */
export function getFocusedBuildings(
	buildings: readonly BuildingMap[],
	center: BuildingFocusPoint,
	connections: BuildingConnections,
	outlines: ReadonlyMap<string, readonly BuildingFocusPoint[]> = new Map(),
	limit = 6
): BuildingMap[] {
	if (!buildings.length || limit <= 0) return [];
	const candidates = buildings
		.map((building) => {
			const [left, top, right, bottom] = building.bounds;
			const outline = outlines.get(building.id);
			const polygon = outline?.length
				? vertices(outline)
				: [
						{ x: left, y: top },
						{ x: right, y: top },
						{ x: right, y: bottom },
						{ x: left, y: bottom }
					];
			return {
				building,
				polygon,
				distance: centerDistance(polygon, center),
				area: (right - left) * (bottom - top)
			};
		})
		.sort(
			(a, b) =>
				a.distance - b.distance || a.area - b.area || a.building.id.localeCompare(b.building.id)
		);
	const root = candidates[0];
	const selected = [root.building];
	const remaining = candidates
		.slice(1)
		.map((candidate) => ({
			...candidate,
			distance: outlineDistance(root.polygon, candidate.polygon)
		}))
		.sort((a, b) => a.distance - b.distance || a.building.id.localeCompare(b.building.id));
	while (selected.length < limit && remaining.length) {
		// まず表示中のいずれかの棟につながる候補を選び、接続の途中を飛ばさないようにします。
		let index = remaining.findIndex(({ building }) =>
			selected.some(({ id }) => connections.get(id)?.has(building.id))
		);
		if (index < 0) index = 0;
		selected.push(remaining.splice(index, 1)[0].building);
	}
	return selected;
}
