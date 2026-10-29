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
	it('バリアフリーの切り替えで実データの経路を再検索し、階段を通らない', () => {
		const state = createNavigationState();
		const normal = state.showRoute('node_outdoor_f0_main-gate', 'node_la_f1_hr_1-1');
		expect(normal).not.toBeNull();
		state.setBarrierFree(true);
		expect(state.barrierFree).toBe(true);
		expect(state.routePath).not.toEqual(normal);
		expect(state.routePath).not.toBeNull();
		for (let i = 1; i < state.routePath!.length; i++) {
			const from = state.routePath![i - 1];
			const to = state.routePath![i];
			expect(
				state.graph.edges.some(
					(edge) =>
						!edge.isStairs &&
						((edge.fromNode === from && edge.toNode === to) ||
							(edge.fromNode === to && edge.toNode === from))
				)
			).toBe(true);
		}
		state.setBarrierFree(false);
		expect(state.routePath).toEqual(normal);
		state.clearRoute();
		state.setBarrierFree(true);
		expect(state.routePath).toBeNull();
	});

	it('階段以外の経路がない場合は解除し、オフに戻すと以前の検索条件で復元する', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const state = createNavigationState({
			...data,
			graph: { ...data.graph, edges: data.graph.edges.map((edge) => ({ ...edge, isStairs: true })) }
		});
		state.setHighlight('poi-a', 'start');
		state.setHighlight('poi-b', 'goal');
		expect(state.showRoute('a', 'b')).toEqual(['a', 'b']);
		state.setBarrierFree(true);
		expect(state.routePath).toBeNull();
		expect(state.routeError).toContain('階段を使わない経路が見つかりません');
		expect(state.highlights).toEqual({ start: 'poi-a', goal: 'poi-b' });
		state.setBarrierFree(false);
		expect(state.routePath).toEqual(['a', 'b']);
		expect(state.routeError).toBeNull();
	});
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
