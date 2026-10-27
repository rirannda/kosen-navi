<script lang="ts">
	import type { Poi } from '#lib';

	let {
		results,
		onselect,
		activeIndex = -1,
		listboxId,
		optionId
	}: {
		results: Poi[];
		onselect: (poi: Poi) => void;
		activeIndex?: number;
		listboxId: string;
		optionId: (i: number) => string;
	} = $props();

	$effect(() => {
		if (activeIndex >= 0) {
			document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' });
		}
	});
</script>

{#if results.length > 0}
	<ul
		id={listboxId}
		class="max-h-[calc(12.5rem+2px)] overflow-y-auto rounded-b border border-gray-300 bg-white"
		role="listbox"
	>
		{#each results as poi, i (poi.id)}
			<li id={optionId(i)} role="option" aria-selected={i === activeIndex}>
				<button
					type="button"
					tabindex="-1"
					class="w-full px-3 py-2 text-left hover:bg-gray-100 {i === activeIndex
						? 'bg-gray-100'
						: ''}"
					onclick={() => onselect(poi)}
				>
					{poi.name}
				</button>
			</li>
		{/each}
	</ul>
{/if}
