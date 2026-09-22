<template>
  <Dialog v-model:open="show">
    <DialogContent
      @pointer-down-outside="(event) => event.preventDefault()"
      @escape-key-down="(event) => event.preventDefault()"
    >
      <form @submit.prevent="$emit('submit')">
        <DialogHeader>
          <DialogTitle>{{ title }}</DialogTitle>
          <div class="my-4 gap-4 flex flex-col">
            <slot />
          </div>
        </DialogHeader>
        <DialogFooter>
          <DialogClose>
            <Button type="button" variant="outline">
              取消
            </Button>
          </DialogClose>
          <Button type="submit">
            {{ submitButtonText || "保存" }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
<script lang="ts" setup>
const show = defineModel({ type: Boolean });
//#region Props
const { title, submitButtonText } = defineProps<{
  title: string;
  loading?: boolean;
  submitButtonText?: string;
}>();
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
