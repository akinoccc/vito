<script setup lang="ts" generic="Row, Query extends Record<string, unknown>">
import type { CrudField, UseCrudListReturn } from '@uozi/vito-core'
import type { FormProps } from 'naive-ui'
import { filterFieldsBySurface } from '@uozi/vito-core'
import { NButton, NForm, NFormItem, NSpace } from 'naive-ui'
import { computed, h, reactive, watch } from 'vue'
import { componentMap, getFieldLabel, resolveControlProps, resolveFormItemProps } from '../adapter'

export interface Props<Row, Query extends Record<string, unknown>> {
  /** CRUD list state from useCrudList */
  list: UseCrudListReturn<Row, Query>
  /** Field definitions */
  fields: CrudField<Row>[]
  /**
   * Where to read/write search conditions in query.
   * - undefined: flat query (default)
   * - 'search': nested query.search = { ... }
   */
  queryKey?: string
  /** Form props passthrough */
  formProps?: FormProps
  /** Whether to show reset button */
  showReset?: boolean
  /** Whether to show search button */
  showSearch?: boolean
}

const props = withDefaults(defineProps<Props<Row, Query>>(), {
  showReset: true,
  showSearch: true,
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getQuerySource(query: Query): Record<string, unknown> {
  if (!props.queryKey)
    return query as any
  const nested = (query as any)?.[props.queryKey]
  return isRecord(nested) ? nested : {}
}

// Filter fields visible in search
const searchFields = computed(() => {
  return filterFieldsBySurface(props.fields, 'searchForm', {
    query: props.list.query.value as Record<string, unknown>,
  })
})

const searchFieldKeys = computed(() => searchFields.value.map(f => f.key))

// Local search model (synced with list.query)
const searchModel = reactive<Record<string, unknown>>({})

// Sync from list.query to searchModel
watch(
  () => props.list.query.value,
  (query) => {
    Object.keys(searchModel).forEach((key) => {
      delete searchModel[key]
    })
    const src = getQuerySource(query)
    for (const key of searchFieldKeys.value) {
      if (key in src)
        searchModel[key] = src[key]
    }
  },
  { immediate: true, deep: true },
)

// Handle search
function handleSearch() {
  if (!props.queryKey) {
    props.list.setQuery(searchModel as Partial<Query>, {
      mode: 'merge',
      clearKeys: searchFieldKeys.value,
      pruneEmpty: true,
    })
    return
  }

  props.list.setQuery({
    [props.queryKey]: { ...searchModel },
  } as any, {
    mode: 'merge',
    pruneEmpty: true,
  })
}

// Handle reset
function handleReset() {
  Object.keys(searchModel).forEach((key) => {
    delete searchModel[key]
  })
  props.list.reset()
}

// Render field control
function renderControl(field: CrudField<Row>) {
  const component = componentMap[field.type] ?? componentMap.text
  const controlProps = resolveControlProps(field as any, 'searchForm')

  return h(component, {
    'modelValue': searchModel[field.key],
    'onUpdate:modelValue': (value: unknown) => {
      searchModel[field.key] = value
    },
    'field': field,
    'surface': 'searchForm',
    ...controlProps,
  })
}
</script>

<template>
  <div class="crud-search">
    <NForm
      inline
      label-placement="left"
      v-bind="formProps"
      @submit.prevent="handleSearch"
    >
      <NFormItem
        v-for="field in searchFields"
        :key="field.key"
        :label="getFieldLabel(field)"
        :feedback-style="{ display: 'none' }"
        v-bind="resolveFormItemProps(field as any, 'searchForm')"
      >
        <slot
          :name="`search-${field.key}`"
          :field="field"
          :model="searchModel"
        >
          <component :is="() => renderControl(field)" />
        </slot>
      </NFormItem>

      <NFormItem
        v-if="showSearch || showReset"
        :feedback-style="{ display: 'none' }"
      >
        <NSpace>
          <NButton
            v-if="showSearch"
            type="primary"
            attr-type="submit"
          >
            搜索
          </NButton>
          <NButton
            v-if="showReset"
            @click="handleReset"
          >
            重置
          </NButton>
        </NSpace>
      </NFormItem>
    </NForm>
  </div>
</template>

<style scoped>
.crud-search {
  margin-bottom: 16px;
}

:deep(.n-form--inline) {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
</style>
