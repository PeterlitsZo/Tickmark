import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { API_ORIGIN } from '../../api/client';
import { todosApi, type Todo } from '../../api/todos';
import { categoriesApi, isCategoryColor, type Category } from '../../api/categories';
import { useEntries } from '../entries/EntriesProvider';
import { categoriesKey } from '../categories/categoriesQueries';
import { useWriteGuard } from './useWriteGuard';

const todosKey = ['todos', API_ORIGIN] as const;
function useWorkspaceState() {
  const { online, categories } = useEntries();
  const client = useQueryClient();
  const todos = useQuery({ queryKey: todosKey, queryFn: ({ signal }) => todosApi.list('ALL', signal), retry: false });
  const refreshTodos = async () => { const result = await todos.refetch(); if (result.error) throw result.error; };
  const refreshCategories = async () => { const result = await categories.refetch(); if (result.error) throw result.error; };
  const todoWrite = useWriteGuard(online, refreshTodos);
  const categoryWrite = useWriteGuard(online, refreshCategories);
  const [todoTitle, setTodoTitle] = useState('');
  const [todoEdit, setTodoEdit] = useState<{ id: string; title: string } | null>(null);
  const [completedOpen, setCompletedOpen] = useState(false);
  const todoScroll = useRef(0);
  const [categoryEdit, setCategoryEdit] = useState<{ original?: Category; name: string; color: string } | null>(null);
  async function commitTodo(saved?: Todo, removedId?: string) {
    await client.cancelQueries({ queryKey: todosKey });
    client.setQueryData<Todo[]>(todosKey, previous => {
      if (!previous) return previous;
      const next = previous.filter(item => item.id !== (saved?.id ?? removedId));
      if (saved) next.push(saved);
      return next.sort((a, b) => b.id.length - a.id.length || b.id.localeCompare(a.id));
    });
    void client.invalidateQueries({ queryKey: todosKey });
  }
  async function saveTodo() {
    const title = todoEdit?.title ?? todoTitle;
    if (Array.from(title).length < 1 || Array.from(title).length > 500) {
      todoWrite.setError('Use 1–500 characters for the title.'); return;
    }
    if (todoEdit && todos.data?.find(todo => todo.id === todoEdit.id)?.title === title) { setTodoEdit(null); return; }
    await todoWrite.run(async () => {
      const saved = todoEdit ? await todosApi.patch(todoEdit.id, { title }) : await todosApi.create(title);
      await commitTodo(saved);
      if (todoEdit) setTodoEdit(null); else setTodoTitle('');
    });
  }
  async function toggleTodo(todo: Todo) {
    await todoWrite.run(async () => {
      await commitTodo(await todosApi.patch(todo.id, { status: todo.status === 'OPEN' ? 'COMPLETED' : 'OPEN' }));
    });
  }
  function deleteTodo(todo: Todo) {
    Alert.alert('Delete todo?', 'This permanently deletes the todo.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { void todoWrite.run(async () => {
        await todosApi.remove(todo.id); await commitTodo(undefined, todo.id);
        if (todoEdit?.id === todo.id) setTodoEdit(null);
      }); } },
    ]);
  }
  async function commitCategory(saved?: Category, removedId?: string) {
    await client.cancelQueries({ queryKey: categoriesKey });
    client.setQueryData<Category[]>(categoriesKey, previous => {
      if (!previous) return previous;
      const next = previous.filter(item => item.id !== (saved?.id ?? removedId));
      if (saved) next.push(saved);
      return next.sort((a, b) => a.id.length - b.id.length || a.id.localeCompare(b.id));
    });
    void client.invalidateQueries({ queryKey: categoriesKey });
  }
  async function saveCategory() {
    if (!categoryEdit) return;
    const name = categoryEdit.name.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, '');
    if (!name || Array.from(name).length > 100) { categoryWrite.setError('Use 1–100 characters for the category name.'); return; }
    if (categoryEdit.original && name === categoryEdit.original.name && categoryEdit.color === categoryEdit.original.color) { setCategoryEdit(null); return; }
    await categoryWrite.run(async () => {
      const { original, color } = categoryEdit;
      const colorChange = color !== original?.color && isCategoryColor(color) ? { color } : {};
      const saved = original
        ? await categoriesApi.update(original.id, { ...(name !== original.name ? { name } : {}), ...colorChange })
        : await categoriesApi.create({ name, color: isCategoryColor(color) ? color : 'GRAY' });
      await commitCategory(saved); setCategoryEdit(null);
    });
  }
  function deleteCategory(category: Category) {
    Alert.alert('Delete category?', 'Categories used by any time entry cannot be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { void categoryWrite.run(async () => {
        await categoriesApi.remove(category.id); await commitCategory(undefined, category.id); setCategoryEdit(null);
      }); } },
    ]);
  }
  return { online, todos, refreshTodos, todoWrite, todoTitle, setTodoTitle, todoEdit, setTodoEdit, completedOpen, setCompletedOpen, saveTodoScroll: (offset: number) => { todoScroll.current = offset; }, readTodoScroll: () => todoScroll.current, saveTodo, toggleTodo, deleteTodo,
    categories, refreshCategories, categoryWrite, categoryEdit, setCategoryEdit, saveCategory, deleteCategory };
}
const Context = createContext<ReturnType<typeof useWorkspaceState> | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const state = useWorkspaceState();
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export function useWorkspace() {
  const state = useContext(Context);
  if (!state) throw new Error('WorkspaceProvider is required');
  return state;
}
