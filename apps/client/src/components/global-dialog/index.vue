<template>
  <Dialog v-model:open="show">
    <DialogContent
      @pointer-down-outside="(event) => event.preventDefault()"
      @escape-key-down="(event) => event.preventDefault()"
    >
      <form @submit.prevent="$emit('submit')">
        <DialogHeader>
          <DialogTitle>{{ title }}</DialogTitle>
          <div class="mt-2 gap-2 flex flex-col">
            <slot />
          </div>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            class="button-no-shadow"
            variant="outline"
            @click="show = false"
          >
            取消
          </Button>
          <Button type="submit">保存</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
<script lang="ts" setup>
const show = defineModel({ type: Boolean });
//#region Props
const { title, loading } = defineProps<{ title: string; loading?: boolean }>();
//#endregion
//#region Emits
defineEmits(["submit"]);
//#endregion
//#region Hooks
//#endregion
//#region Computed
//#endregion
//#region Watch
//#endregion
//#region Event
//#endregion
//#region Function
//#endregion
//#region Life Cycle
//#endregion
//#region Expose
//#endregion
</script>
