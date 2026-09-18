<template>
  <div class="pt-14 px-2 flex h-full flex-col gap-4">
    <Button class="menu-button" variant="ghost" @click="createNewSession">
      <SquarePen animateOnHover triggerTarget="parent" />
      新会话
    </Button>
    <Button class="menu-button" variant="ghost" @click="selectWorkspace">
      <FolderOpen :size="17" />
      选择工作区
    </Button>

    <div class="min-h-0 flex-1">
      <div class="text-sm text-muted-foreground flex gap-1 items-center mb-2 px-2">
        最近
        <ChevronDown :size="16" />
      </div>
      <div class="flex max-h-full flex-col gap-1 overflow-y-auto">
        <Button
          v-for="session in sessions"
          :key="session.id"
          class="menu-button justify-start"
          :variant="session.id === currentSessionId ? 'secondary' : 'ghost'"
          @click="agent.selectSession(session.id)"
        >
          <span class="truncate">{{ session.title }}</span>
        </Button>
        <p v-if="!sessions.length" class="px-2 text-xs text-muted-foreground">当前工作区还没有会话。</p>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { SquarePen } from "@respeak/lucide-motion-vue";
import { ChevronDown, FolderOpen } from "@lucide/vue";
import { storeToRefs } from "pinia";
import Button from "@/components/ui/button/Button.vue";
import { useAgentStore } from "@/stores/agent";

const agent = useAgentStore();
const { sessions, currentSessionId } = storeToRefs(agent);

async function createNewSession() { await agent.newSession(); }
async function selectWorkspace() {
  const workspace = await agent.chooseWorkspace();
  if (workspace) await agent.newSession();
}

onMounted(() => agent.initialize());
</script>
