<script lang="ts">
	import PoiSearchInput from '#lib/components/elements/PoiSearchInput.svelte';
	import { requireNavigation } from '#lib';

	const navigation = requireNavigation();

	type Role = 'start' | 'goal';

	const roles: { role: Role; placeholder: string; refocusLabel: string }[] = [
		{ role: 'start', placeholder: '出発地を検索', refocusLabel: '出発地に移動' },
		{ role: 'goal', placeholder: '目的地を検索', refocusLabel: '目的地に移動' }
	];

	let selected = $state<Record<Role, string | null>>({ start: null, goal: null });

	function select(role: Role, poiId: string) {
		selected[role] = poiId;
		navigation.setHighlight(poiId, role);
		navigation.requestFocus(poiId);
	}

	const nodeIdOf = (poiId: string) => navigation.resolvePoi(poiId)?.poi.nodeId;

	function navigate() {
		const { start, goal } = selected;
		if (!start || !goal) return;
		const startNode = nodeIdOf(start);
		const goalNode = nodeIdOf(goal);
		if (!startNode || !goalNode) {
			console.error(`経路の始点または終点が見つかりません: ${start} -> ${goal}`);
			return;
		}
		navigation.showRoute(startNode, goalNode);
		navigation.setHighlight(start, 'start');
		navigation.setHighlight(goal, 'goal');
		navigation.requestFocus(start);
	}
</script>

<div class="absolute top-4 left-4 z-10 flex flex-col gap-2">
	{#each roles as { role, placeholder, refocusLabel } (role)}
		{@const poiId = selected[role]}
		<div class="flex items-start gap-2">
			<PoiSearchInput {placeholder} onselect={(id) => select(role, id)} />
			<button
				type="button"
				class="material-symbols-outlined h-10 shrink-0 rounded-full border border-gray-300 bg-white px-3 text-sm disabled:opacity-40"
				disabled={!poiId}
				aria-label={refocusLabel}
				onclick={() => poiId && navigation.requestFocus(poiId)}
			>
				restart_alt
			</button>
		</div>
	{/each}
	<button
		type="button"
		class="rounded-full bg-blue-600 px-4 py-2 text-white disabled:opacity-40"
		disabled={!selected.start || !selected.goal}
		onclick={navigate}
	>
		ルート検索
	</button>
</div>
