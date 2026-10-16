<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent
      :show-close-button="showCloseButton"
      :class="cn('gap-4 sm:max-w-md', props.class)"
      @pointer-down-outside="handlePointerDownOutside"
      @escape-key-down="handleEscapeKeyDown"
    >
      <form class="flex flex-col gap-4" @submit.prevent="emit('confirm')">
        <DialogHeader class="gap-2">
          <div class="flex items-start gap-3">
            <component
              :is="resolvedIcon"
              v-if="resolvedIcon"
              class="mt-0.5 size-5 shrink-0"
              :class="
                variant === 'destructive' ? 'text-destructive' : 'text-primary'
              "
              aria-hidden="true"
            />
            <div class="flex min-w-0 flex-1 flex-col gap-2 text-left">
              <DialogTitle class="text-base">
                {{ title }}
              </DialogTitle>
              <DialogDescription
                v-if="description"
                class="text-sm leading-relaxed break-words"
              >
                {{ description }}
              </DialogDescription>
              <DialogDescription v-else class="sr-only">
                {{ title }}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <slot />

        <DialogFooter class="mt-1">
          <Button
            v-if="showCancelButton"
            type="button"
            variant="outline"
            :disabled="loading"
            @click="emit('cancel')"
          >
            {{ cancelText }}
          </Button>
          <Button
            type="submit"
            :class="cn(variant === 'destructive' && 'text-white')"
            :variant="variant === 'destructive' ? 'destructive' : 'default'"
            :disabled="loading"
          >
            <LoaderCircle v-if="loading" class="animate-spin" />
            {{ confirmText }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<script lang="ts" setup>
import type { Component, HTMLAttributes } from "vue";
import { computed } from "vue";
import { CircleQuestionMark, LoaderCircle, TriangleAlert } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ConfirmVariant } from "@/hooks/useConfirm";
import { cn } from "@/lib/utils";

const props = withDefaults(
  defineProps<{
    /** 是否打开 */
    open?: boolean;
    /** 标题 */
    title?: string;
    /** 补充说明 */
    description?: string;
    /** 确认按钮文案 */
    confirmText?: string;
    /** 取消按钮文案 */
    cancelText?: string;
    /** 语气，destructive 用于删除等不可逆操作 */
    variant?: ConfirmVariant;
    /** 自定义图标，传 null 则不显示 */
    icon?: Component | null;
    /** 确认中，此时按钮 loading 且禁止关闭 */
    loading?: boolean;
    /** 是否显示取消按钮 */
    showCancelButton?: boolean;
    /** 是否显示右上角关闭按钮 */
    showCloseButton?: boolean;
    /** 点击遮罩是否关闭 */
    closeOnClickOutside?: boolean;
    /** 按 Esc 是否关闭 */
    closeOnEscape?: boolean;
    class?: HTMLAttributes["class"];
  }>(),
  {
    open: false,
    title: "",
    description: "",
    confirmText: "确定",
    cancelText: "取消",
    variant: "default",
    icon: null,
    loading: false,
    showCancelButton: true,
    showCloseButton: true,
    closeOnClickOutside: true,
    closeOnEscape: true,
  },
);

const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [];
  cancel: [];
}>();

const resolvedIcon = computed<Component | null>(
  () =>
    props.icon ??
    (props.variant === "destructive" ? TriangleAlert : CircleQuestionMark),
);

function handleOpenChange(value: boolean) {
  // 确认中禁止通过 Esc / 遮罩 / 关闭按钮中断
  if (!value && props.loading) return;
  emit("update:open", value);
}

function handlePointerDownOutside(event: Event) {
  if (!props.closeOnClickOutside || props.loading) event.preventDefault();
}

function handleEscapeKeyDown(event: KeyboardEvent) {
  if (!props.closeOnEscape || props.loading) event.preventDefault();
}
</script>
