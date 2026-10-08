/** Typed roleplay interface copy. */
export const en = {
  title: 'Roleplay', close: 'Close', create: 'Create profile', card: 'Character card', profile: 'Character profile',
  name: 'Player name', appearance: 'Player appearance', background: 'Player background', profileTitle: 'Profile name',
  opening: 'Opening situation (optional)', newScene: 'New conversation', open: 'Open', archive: 'Archive', restore: 'Restore',
  scene: 'AI character and scene', time: 'Time', place: 'Place', weather: 'Weather', event: 'Current event',
  body: 'AI bodily condition', clothing: 'AI clothing', emotion: 'Temporary emotion', metrics: 'Relationship',
  affinity: 'Affinity', trust: 'Trust', save: 'Save', memory: 'Shared memories', invalidate: 'Invalidate', review: 'Review required',
  sources: 'Sources and revisions', conflicts: 'Conflicts', resolve: 'Resolve', updateCard: 'Apply current card version',
  continue: 'Continue', undo: 'Undo latest reply', regenerate: 'Regenerate latest reply', branch: 'Branch here',
  viewHistory: 'Choose a point in history', userMessage: 'Your message', assistantReply: 'Character reply',
  loading: 'Loading…', empty: 'Create a character profile to start a conversation.',
  noMemory: 'No selected memories yet.', noCharacter: 'Choose a roleplay conversation to view its character.',
  cardVersion: 'Bound card version', refresh: 'Refresh', player: 'Player persona', status: 'Status',
  active: 'Active', invalid: 'Invalid', archived: 'Archived', view: 'Character details',
  undoNotice: 'Undo opens a replacement conversation and archives the original. Later edits remain; conflicts need review.',
  cardNotice: 'Applying a card marks existing memories for review. Historical dialogue remains.',
}
/** Roleplay locale keys. */
export type RoleplayKey = keyof typeof en
/** Chinese roleplay copy. */
export const zh: Record<RoleplayKey, string> = {
  title: '角色扮演', close: '关闭', create: '创建档案', card: '角色卡', profile: '角色档案',
  name: '玩家姓名', appearance: '玩家外貌', background: '玩家背景', profileTitle: '档案名称',
  opening: '开场情境（可选）', newScene: '新建会话', open: '打开', archive: '归档', restore: '恢复',
  scene: 'AI 角色与场景', time: '时间', place: '地点', weather: '天气', event: '当前事件',
  body: 'AI 身体状态', clothing: 'AI 服饰', emotion: '临时情绪', metrics: '关系',
  affinity: '好感', trust: '信任', save: '保存', memory: '共享记忆', invalidate: '作废', review: '需要复核',
  sources: '来源与修订', conflicts: '冲突', resolve: '解决', updateCard: '应用当前角色卡版本',
  continue: '继续', undo: '撤销最近回复', regenerate: '重生成最近回复', branch: '从这里分支',
  viewHistory: '选择历史位置', userMessage: '你的消息', assistantReply: '角色回复',
  loading: '正在加载…', empty: '创建一个角色档案，开始日常会话。',
  noMemory: '尚无精选记忆。', noCharacter: '请选择角色扮演会话以查看角色。',
  cardVersion: '绑定角色卡版本', refresh: '刷新', player: '玩家设定', status: '状态',
  active: '有效', invalid: '已作废', archived: '已归档', view: '角色详情',
  undoNotice: '撤销会打开替代会话并归档原会话。后续编辑保留，冲突需要复核。',
  cardNotice: '应用角色卡会将现有记忆标记为待复核，历史对话保留。',
}

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { roleplay: RoleplayKey } }
