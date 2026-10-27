import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { baseMapFiles, buildingMaps } from '../maps';

describe('map assets', () => {
	it('static/mapsの全SVGが読み込み対象に登録され、削除済みファイルを参照していない', () => {
		const registered = [
			...baseMapFiles,
			...buildingMaps.flatMap((building) => [
				...Object.values(building.floors),
				...(building.overview ? [building.overview] : [])
			])
		];
		const files = readdirSync('static/maps').filter((file) => file.endsWith('.svg'));
		expect([...new Set(registered)].toSorted()).toEqual(files.toSorted());
		expect(new Set(buildingMaps.map((building) => building.id)).size).toBe(buildingMaps.length);
	});
});
