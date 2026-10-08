# Roleplay domain glossary

This glossary defines terms agreed during the roleplay requirements discussion. It does not describe a shipped feature.

## Language

**Roleplay mode（角色扮演模式）**:

A mode for one user to interact with one primary AI-played character, separate from ordinary work conversations.

**Character（角色）**:

The fictional individual played by the AI, with an identity that continues across conversations.

_Avoid_: Agent, session.

**Character card（角色卡）**:

The authored definition of a character, including the identity and characterization used to portray that individual. One card can supply the character for multiple independent character profiles.

_Avoid_: Conversation history, long-term memory.

**Roleplay conversation（角色扮演会话）**:

One conversation belonging to a character profile, with its own scene state. A character profile can have multiple conversations.

_Avoid_: Character.

**Long-term memory（长期记忆）**:

Selected stable facts, important experiences, and relationship developments retained for use across conversations belonging to the same character profile.

_Avoid_: Current scene state, complete conversation history.

**Scene state（场景状态）**:

The time, place, weather, current events, and the AI character's current bodily condition, clothing, and temporary emotions within one roleplay conversation. Scene state is separate from shared long-term memory and does not track the player's body or clothing.

_Avoid_: Long-term memory.

**Player persona（玩家设定）**:

The user's authored identity within the fiction, including any specified name, appearance, and background. The user can choose a different identity when interacting with a different character.

_Avoid_: AI character, real-world user profile.

**Relationship（关系）**:

The AI character's affinity, trust, and established relationship with the player, shared across conversations in one character profile.

_Avoid_: Temporary emotion.

**Relationship metric（关系指标）**:

A numeric measure of the AI character's affinity or trust toward the player, shared within a character profile. Its value changes through increments and decrements rather than model-assigned absolute values.

_Avoid_: Relationship label, descriptive level.

**Character profile（角色档案）**:

An independent portrayal of a character with a bound card version, player persona, shared long-term memory, relationship, and conversations. Profiles created from the same character card do not share their memories or relationships.

_Avoid_: Character card, roleplay conversation.
