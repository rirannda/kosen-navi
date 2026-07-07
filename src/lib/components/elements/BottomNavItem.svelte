<script lang=ts>
  let { id, isActive } = $props<{
      id: string;
      isActive: boolean;
      onclick: () => void;
  }>();
</script>

<button
  class="flex h-12 w-auto bg-white border-t-2 {
  isActive
    ? 'border-gray-300'
    : 'border-blue-400'
  }"
>
  <span class="material-icons">{id}</span>
</button>
