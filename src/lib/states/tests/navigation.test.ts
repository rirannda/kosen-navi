import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNavigationState } from '../navigation.svelte';
import type { NavigationData } from '../navigation.svelte';

const data: NavigationData = {
	graph: {
		nodes: ['a', 'b', 'isolated'].map((id, x) => ({ id, x, y: 0, floor: 1 })),
		edges: [{ id: 'ab', fromNode: 'a', toNode: 'b', isStairs: false, weight: 1 }]
	},
	pois: ['a', 'b', 'missing-node'].map((id) => ({
		id: `poi-${id}`,
		nodeId: id,
		svgId: id,
		name: id,
		description: '',
		categoryId: ''
	}))
};

afterEach(() => {
	vi.restoreAllMocks();
});

describe('navigation state', () => {
	it('3役割を独立して保持し、不正な入力でも選択を失わない', () => {
		const state = createNavigationState(data);
		expect(state.setHighlight('poi-a', 'start')).toBe(true);
		expect(state.setHighlight('poi-b', 'goal')).toBe(true);
		expect(state.selectedPoi).toBeNull();
		expect(state.setHighlight('poi-a')).toBe(true);
		expect(state.setHighlight('missing')).toBe(false);
		expect(state.setHighlight('poi-missing-node')).toBe(false);
		expect(state.setHighlight('poi-b', 'invalid' as never)).toBe(false);
		expect(state.selectedPoi?.id).toBe('poi-a');
		state.clearHighlight('selected');
		expect(state.selectedPoi).toBeNull();
		expect(state.highlights).toEqual({ start: 'poi-a', goal: 'poi-b' });
		state.clearHighlight();
		expect(state.highlights).toEqual({});
	});

	it('正常経路・同一点・不明ノード・到達不能を処理し、ハイライトと分離する', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const state = createNavigationState(data);
		state.setHighlight('poi-a');
		const path = state.showRoute('a', 'b');
		expect(path).toEqual(['a', 'b']);
		path!.push('caller-change');
		expect(state.routePath).toEqual(['a', 'b']);
		state.clearRoute();
		expect(state.routePath).toBeNull();
		expect(state.showRoute('a', 'a')).toEqual(['a']);
		expect(state.showRoute('a', 'isolated')).toBeNull();
		expect(state.routePath).toBeNull();
		expect(state.showRoute('missing', 'b')).toBeNull();
		expect(state.selectedPoi?.id).toBe('poi-a');
	});

	it('ページごとのインスタンス間で状態を共有しない', () => {
		const first = createNavigationState(data);
		const second = createNavigationState(data);
		first.setHighlight('poi-a');
		first.showRoute('a', 'b');
		expect(second.highlights).toEqual({});
		expect(second.routePath).toBeNull();
	});
});
