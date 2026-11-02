/**
 * Типизированный контекст сессии: компоненты получают её через `getSession()`,
 * а не импортируют модульный синглтон — иначе состояние переживёт навигацию.
 */
import { createContext } from 'svelte';

import type { ChatSession } from './chat.svelte.ts';

export const [getSession, setSession] = createContext<ChatSession>();
