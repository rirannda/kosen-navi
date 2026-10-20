<script lang="ts">
	import type { HighlightColor } from '#lib';
	import { pois } from '../../data/pois';
	let {
		focusOnPoi,
		showRoute,
		highlightPoi,
		clearPoiHighlight
	}: {
		focusOnPoi: (poiId: string) => void;
		showRoute: (startId: string, goalId: string) => void;
		highlightPoi: (poiId: string, color?: HighlightColor) => void;
		clearPoiHighlight: () => void;
	} = $props();
	function navigate(start: string, goal: string) {
		const startNode = pois.find((poi) => poi.id === start)?.nodeId;
		const goalNode = pois.find((poi) => poi.id === goal)?.nodeId;
		if (!startNode || !goalNode) {
			console.error(`経路の始点または終点が見つかりません: ${start} -> ${goal}`);
			return;
		}
		showRoute(startNode, goalNode);
		highlightPoi(start, 'start');
		highlightPoi(goal, 'goal');
		focusOnPoi(start);
	}
</script>

<div class="test-controls">
	<button type="button" onclick={() => focusOnPoi('poi_lr-chem')}>化学講義室へ移動</button>
	<button type="button" onclick={() => focusOnPoi('poi_hr_1-1')}>1-1HRへ移動</button>
	<button type="button" onclick={() => navigate('poi_hr_1-1', 'poi_lab-a-phys')}>
		1-1HRから応用物理実験室への経路を表示
	</button>
	<button type="button" onclick={() => navigate('poi_main-gate', 'poi_student-association-office')}>
		正門から執行部室への経路を表示
	</button>
	<button type="button" onclick={() => highlightPoi('poi_hr_1-1', 'start')}>
		1-1HRをスタート色でハイライト
	</button>
	<button type="button" onclick={() => highlightPoi('poi_lab-a-phys', 'goal')}>
		応用物理実験室をゴール色でハイライト
	</button>
	<button type="button" onclick={() => highlightPoi('poi_lr-chem', 'selected')}>
		化学講義室を選択色でハイライト
	</button>
	<button type="button" onclick={clearPoiHighlight}>POIハイライトを解除</button>
</div>

<style>
	.test-controls {
		padding-bottom: 80px;
	}

	button {
		margin-top: 4px;
		padding: 4px;
		border: solid 1px black;
	}
</style>
