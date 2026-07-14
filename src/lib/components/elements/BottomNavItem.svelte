<script lang=ts>
  let { id, isActive, onclick } = $props<{
      id: string;
      isActive: boolean;
      onclick: () => void;
  }>();
</script>

<!-- メモ -->
<!-- googleのiconのやつを使ってるから後で権利表示のやつをやる -->
<button
  class="flex h-15 w-full bg-white border-t-2 justify-center items-center {
  isActive
    ? 'border-blue-400'
    : 'border-gray-300'
  }"
  onclick={onclick}
>
  <span class="material-symbols-outlined">{id}</span>
</button>
