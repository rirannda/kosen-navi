<script lang="ts">
	import type { Poi } from '#lib';

	let {
		results,
		onselect,
		activeIndex = -1
	}: { results: Poi[]; onselect: (poi: Poi) => void; activeIndex?: number } = $props();
</script>

{#if results.length > 0}
	<ul
		id="search-listbox"
		class="max-h-[calc(12.5rem+2px)] overflow-y-auto rounded-b border border-gray-300 bg-white"
		role="listbox"
	>
		{#each results as poi, i (poi.id)}
			<li id="search-option-{i}" role="option" aria-selected={i === activeIndex}>
				<button
					type="button"
					tabindex="-1"
					class="w-full px-3 py-2 text-left hover:bg-gray-100 {i === activeIndex ? 'bg-gray-100' : ''}"
					onclick={() => onselect(poi)}
				>
					{poi.name}
				</button>
			</li>
		{/each}
	</ul>
{/if}
