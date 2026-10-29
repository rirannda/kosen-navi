<script lang="ts">
	import PoiSearchInput from '#lib/components/elements/PoiSearchInput.svelte';
	import type { BottomSheetSnap } from '../BottomSheet.svelte';
	import { requireNavigation } from '../../states/navigation.svelte';
	import type { NavigationState } from '../../states/navigation.svelte';
	import { buildingMaps } from '../../../data/maps';
	import { getNodeBuildingId } from '../../map/nodeBuilding';
	import { formatFloorLabel } from '../../map/floorDisplay';

	let {
		navigation = requireNavigation(),
		snap = $bindable<BottomSheetSnap>('bottom')
	}: {
		navigation?: NavigationState;
		snap?: BottomSheetSnap;
	} = $props();

	type Role = 'start' | 'goal';
	const id = $props.id();
	let startQuery = $state('');
	let goalQuery = $state('');
	const expanded = $derived(snap !== 'bottom');
	const poi = $derived(navigation.selectedPoi);
	const location = $derived(poi ? navigation.resolvePoi(poi.id) : undefined);
	const building = $derived(
		location ? buildingMaps.find(({ id }) => id === getNodeBuildingId(location.node)) : undefined
	);
	const floorName = $derived(
		location
			? getNodeBuildingId(location.node) === 'outdoor'
				? '屋外'
				: formatFloorLabel(getNodeBuildingId(location.node), location.node.floor, false)
			: ''
	);
	const start = $derived(
		navigation.highlights.start ? navigation.resolvePoi(navigation.highlights.start) : undefined
	);
	const goal = $derived(
		navigation.highlights.goal ? navigation.resolvePoi(navigation.highlights.goal) : undefined
	);
	const canNavigate = $derived(
		start && goal && startQuery === start.poi.name && goalQuery === goal.poi.name
	);
	const resultsMaxHeight = $derived(snap === 'top' ? 'max(8rem, calc(100dvh - 20rem))' : '10rem');

	$effect(() => {
		if (start) startQuery = start.poi.name;
	});
	$effect(() => {
		if (goal) goalQuery = goal.poi.name;
	});

	function search(role: Role, query: string) {
		const selected = role === 'start' ? start : goal;
		if (selected && selected.poi.name !== query) {
			navigation.clearHighlight(role);
			navigation.clearRoute();
		}
		if (query.trim() && snap === 'bottom') snap = 'middle';
	}

	function select(role: Role, poiId: string) {
		navigation.clearRoute();
		navigation.setHighlight(poiId, role);
		if (snap !== 'middle') snap = 'middle';
		navigation.requestFocus(poiId);
	}

	function useSelectedPoi(role: Role) {
		if (!poi) return;
		select(role, poi.id);
		navigation.clearHighlight('selected');
	}

	function navigate(event: SubmitEvent) {
		event.preventDefault();
		if (!canNavigate || !start || !goal) return;
		if (!navigation.showRoute(start.node.id, goal.node.id)) {
			return;
		}
		if (snap === 'top') snap = 'middle';
		navigation.requestFocus(start.poi.id);
	}
</script>

<div class="route-search-panel mx-auto w-full max-w-2xl text-slate-900">
	{#if poi}
		<section aria-label="選択した施設の情報" class="space-y-4">
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					{#if expanded}
						<h2 class="text-xl leading-7 font-semibold break-words">{poi.name}</h2>
					{:else}
						<button
							type="button"
							class="line-clamp-2 text-left text-lg leading-6 font-semibold break-words"
							aria-label={`${poi.name}の詳細を表示`}
							onclick={() => (snap = 'middle')}>{poi.name}</button
						>
					{/if}
					<p class="mt-1 text-sm text-slate-500">
						{[building?.name, floorName].filter(Boolean).join(' · ')}
					</p>
				</div>
				<button
					type="button"
					class="flex size-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-2xl text-slate-600 hover:bg-slate-200"
					aria-label="施設情報を閉じる"
					onclick={() => navigation.clearHighlight('selected')}>×</button
				>
			</div>
			{#if expanded}
				{#if poi.description.trim()}
					<p
						class={[
							'poi-description text-sm leading-7 whitespace-pre-line text-slate-600',
							snap === 'middle' && 'line-clamp-2'
						]}
					>
						{poi.description}
					</p>
				{/if}
				<div class="flex flex-wrap gap-2">
					<button
						type="button"
						class="min-h-11 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
						onclick={() => useSelectedPoi('goal')}>ここへ行く</button
					>
					<button
						type="button"
						class="min-h-11 rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold hover:bg-slate-50"
						onclick={() => useSelectedPoi('start')}>出発地にする</button
					>
				</div>
			{/if}
		</section>
	{:else}
		<form class="space-y-3" aria-label="経路検索" onsubmit={navigate}>
			<div class={expanded ? 'space-y-1.5' : 'hidden'}>
				<label for={`${id}-start`} class="text-sm font-medium text-slate-600">出発地</label>
				<PoiSearchInput
					id={`${id}-start`}
					label="出発地"
					placeholder="出発地を検索"
					bind:query={startQuery}
					inlineResults
					{resultsMaxHeight}
					onsearch={(query) => search('start', query)}
					onselect={(poiId) => select('start', poiId)}
				/>
			</div>
			<div class="space-y-1.5">
				<label
					for={`${id}-goal`}
					class={expanded ? 'text-sm font-medium text-slate-600' : 'sr-only'}>行き先</label
				>
				<div class="flex items-start gap-3">
					<div class="min-w-0 flex-1">
						<PoiSearchInput
							id={`${id}-goal`}
							label="行き先"
							placeholder="行き先を検索"
							bind:query={goalQuery}
							inlineResults
							{resultsMaxHeight}
							onsearch={(query) => search('goal', query)}
							onselect={(poiId) => select('goal', poiId)}
						/>
					</div>
					<button
						type="button"
						role="switch"
						aria-label="バリアフリー"
						aria-checked={navigation.barrierFree}
						aria-describedby={`${id}-barrier-free-hint`}
						class="flex min-h-13 shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-xs font-medium text-slate-600 focus-visible:outline-2 focus-visible:outline-blue-600"
						onclick={() => navigation.setBarrierFree(!navigation.barrierFree)}
					>
						<span>バリアフリー</span>
						<span
							aria-hidden="true"
							class={[
								'flex h-6 w-11 items-center rounded-full p-0.5 transition-colors',
								navigation.barrierFree ? 'bg-blue-600' : 'bg-slate-300'
							]}
						>
							<span
								class={[
									'size-5 rounded-full bg-white shadow-sm transition-transform',
									navigation.barrierFree && 'translate-x-5'
								]}
							></span>
						</span>
					</button>
					<span id={`${id}-barrier-free-hint`} class="sr-only"
						>階段を使わない経路を検索します。</span
					>
				</div>
			</div>
			{#if expanded}
				<div class="flex flex-wrap gap-2 pt-1">
					<button
						type="submit"
						class="min-h-11 flex-1 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500"
						disabled={!canNavigate}>ルート検索</button
					>
					{#if navigation.routePath}
						<button
							type="button"
							class="min-h-11 rounded-full border border-slate-300 px-5 py-2 text-sm"
							onclick={() => navigation.clearRoute()}>経路を解除</button
						>
					{/if}
				</div>
				{#if navigation.routeError}<p role="alert" class="text-sm text-red-700">
						{navigation.routeError}
					</p>{/if}
			{/if}
		</form>
	{/if}
</div>
