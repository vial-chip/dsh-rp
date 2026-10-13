/** Chinese copy shared by both application locales for roleplay. */
export const zh = {
  'card': '角色卡', 'world': '世界', 'body': '身体', 'clothing': '服饰', 'relationship': '关系',
  'choose': '选择角色卡', 'fixed': '角色设定已固定', 'emptyCards': '没有可用的角色卡',
  'noRoleplay': '请在角色扮演会话中查看', 'empty': '尚未记录状态',
  'edit': '编辑', 'save': '保存', 'cancel': '取消', 'add': '添加状态',
  'field': '项目名称', 'value': '记录内容', 'number': '数值',
  'invalid': '请填写项目名称和有效内容', 'saved': '状态已保存',
  'failed': '操作未完成，请重试', 'loadFailed': '角色卡未能加载', 'retry': '重试',
  'undo': '撤销最近一轮', 'regenerate': '重新生成', 'undone': '已撤销，输入已放回输入框',
  'undoneContinue': '已撤销最近一轮',
  'regenerated': '已开始重新生成', 'selected': '已选择角色卡',
  'recorded': '这里显示已记录的状态；人工编辑只在角色主动读取时提供给角色',
  'cardHint': '首次发送后，本会话使用固定的角色设定',
  'tools': '工具', 'toolsHint': '应用级设置，对所有角色扮演会话生效',
  'toolsUnavailable': '未能读取工具设置', 'toolsSaved': '工具设置已保存', 'restartRequired': '工具设置已保存，重启后生效',
  'tool-world-read': '读取世界', 'tool-world-update': '更新世界',
  'tool-body-read': '读取身体', 'tool-body-update': '更新身体',
  'tool-clothing-read': '读取服饰', 'tool-clothing-update': '更新服饰',
  'tool-relationship-read': '读取关系', 'tool-relationship-update': '更新关系',
} satisfies Record<string, string>
/** Keys owned by the roleplay namespace. */
export type RoleplayKey = keyof typeof zh
/** Roleplay always uses Chinese, including in an English application locale. */
export const en = { ...zh } satisfies Record<RoleplayKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Roleplay controls and state panel labels. */
    roleplay: RoleplayKey
  }
}
