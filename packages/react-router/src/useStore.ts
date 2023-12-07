import * as React from 'react'
import { NonNullableUpdater, functionalUpdate, shallow } from './utils'

export type Store<T> = {
  getState: () => T
  setState: (
    updater: NonNullableUpdater<T>,
    opts?: {
      notify?: boolean
    },
  ) => void
  subscribe: (listener: (state: T) => void) => () => void
}

export const createStore = <T>(
  createState: (
    setState: (nextState: T) => void,
    getState: () => T,
    api: Store<T>,
  ) => T,
  opts?: {
    onUpdate?: (nextState: T, prevState: T) => T
  },
): Store<T> => {
  let state: T
  const listeners = new Set<
    (nextState: T, prevState: T) => void | Promise<void>
  >()

  const setState = (
    updater: NonNullableUpdater<T>,
    opts2?: {
      notify?: boolean
    },
  ) => {
    const previousState = state
    state = functionalUpdate(updater, state)
    if (opts?.onUpdate) {
      state = opts.onUpdate(state, previousState)
    }
    if (opts2?.notify ?? true) {
      listeners.forEach((listener) => listener(state, previousState))
    }
  }

  const getState = () => state

  const subscribe = (
    listener: (nextState: T, prevState: T) => void | Promise<void>,
  ) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  const api = { setState, getState, subscribe }
  state = createState(setState, getState, api)

  return api
}

const defaultSelector = <T>(state: T) => state as any

export function useStore<State, Slice>(
  store: Store<State>,
  selector_?: (state: State) => Slice,
  // areEqual: (a: Slice, b: Slice) => boolean = shallow,
) {
  const state = store.getState()
  const selector = (selector_ || defaultSelector) as (state: State) => Slice
  const slice = React.useMemo(() => selector(state), [state])

  const [[sliceFromReducer, storeFromReducer], rerender] = React.useReducer<
    React.Reducer<readonly [Slice, Store<State>], boolean | undefined>,
    undefined
  >(
    (prev, shouldSync?: boolean) => {
      if (shouldSync) {
        return [slice, store]
      }

      const nextState = store.getState()

      if (Object.is(state, nextState) && prev[1] === store) {
        return prev
      }

      const nextSlice = selector(nextState)

      if (shallow(prev[0], nextSlice) && prev[1] === store) {
        return prev
      }

      return [nextSlice, store]
    },
    undefined,
    () => [slice, store],
  )

  React.useEffect(() => {
    const unsubscribe = store.subscribe(() =>
      (rerender as React.DispatchWithoutAction)(),
    )
    ;(rerender as React.DispatchWithoutAction)()
    return unsubscribe
  }, [store])

  if (storeFromReducer !== store) {
    rerender(true)
    return slice
  }

  if (!shallow(sliceFromReducer, slice)) {
    rerender(true)
  }

  return sliceFromReducer
}
