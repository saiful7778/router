import * as React from 'react'
import invariant from 'tiny-invariant'
import warning from 'tiny-warning'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { useRouter, useRouterState } from './RouterProvider'
import { ResolveRelativePath, ToOptions } from './link'
import { AnyRoute, ReactNode, rootRouteId } from './route'
import {
  FullSearchSchema,
  ParseRoute,
  RouteById,
  RouteByPath,
  RouteIds,
  RoutePaths,
} from './routeInfo'
import { RegisteredRouter } from './router'
import { NoInfer, StrictOrFrom, pick } from './utils'

export interface RouteMatch<
  TRouteTree extends AnyRoute = AnyRoute,
  TRouteId extends RouteIds<TRouteTree> = ParseRoute<TRouteTree>['id'],
> {
  id: string
  routeId: TRouteId
  pathname: string
  params: RouteById<TRouteTree, TRouteId>['types']['allParams']
  status: 'pending' | 'success' | 'error'
  isFetching: boolean
  showPending: boolean
  invalid: boolean
  error: unknown
  paramsError: unknown
  searchError: unknown
  updatedAt: number
  loadPromise?: Promise<void>
  loaderData?: RouteById<TRouteTree, TRouteId>['types']['loaderData']
  __resolveLoadPromise?: () => void
  context: RouteById<TRouteTree, TRouteId>['types']['allContext']
  search: FullSearchSchema<TRouteTree> &
    RouteById<TRouteTree, TRouteId>['types']['fullSearchSchema']
  fetchedAt: number
  shouldReloadDeps: any
  abortController: AbortController
  cause: 'enter' | 'stay'
}

export type AnyRouteMatch = RouteMatch<any>

export function Matches() {
  const { routesById } = useRouter()
  const matchId = useRouterState({
    select: (s) => s.matches[0]?.id ?? '',
  })

  const resetKey = useRouterState({
    select: (s) => s.resolvedLocation.state.key,
  })

  const route = routesById[rootRouteId]!

  const errorComponent = React.useCallback(
    (props: any) => {
      return React.createElement(ErrorComponent, {
        ...props,
        useMatch: route.useMatch,
        useRouteContext: route.useRouteContext,
        useSearch: route.useSearch,
        useParams: route.useParams,
      })
    },
    [route],
  )

  return (
    <matchesContext.Provider value={matchId}>
      <CatchBoundary
        resetKey={resetKey}
        errorComponent={errorComponent}
        onCatch={() => {
          warning(
            false,
            `Error in router! Consider setting an 'errorComponent' in your RootRoute! 👍`,
          )
        }}
      >
        {matchId ? <Match matchId={matchId} /> : null}
      </CatchBoundary>
    </matchesContext.Provider>
  )
}

function SafeFragment(props: any) {
  return <>{props.children}</>
}

export function Match({ matchId }: { matchId: string }) {
  // const router = useRouter()
  const { options, routesById } = useRouter()

  const routeId = useRouterState({
    select: (s) => s.matches.find((d) => d.id === matchId)!.routeId,
  })

  const route = routesById[routeId]!
  const resetKey = useRouterState().resolvedLocation.state?.key

  const PendingComponent = (route.options.pendingComponent ??
    options.defaultPendingComponent) as any

  const pendingElement = PendingComponent
    ? React.createElement(PendingComponent, {
        useMatch: route.useMatch,
        useRouteContext: route.useRouteContext,
        useSearch: route.useSearch,
        useParams: route.useParams,
      })
    : undefined

  const routeErrorComponent =
    route.options.errorComponent ??
    options.defaultErrorComponent ??
    ErrorComponent

  const ResolvedSuspenseBoundary =
    route.options.wrapInSuspense ?? pendingElement
      ? React.Suspense
      : SafeFragment

  const errorComponent = routeErrorComponent
    ? React.useCallback(
        (props: any) => {
          return React.createElement(routeErrorComponent, {
            ...props,
            useMatch: route.useMatch,
            useRouteContext: route.useRouteContext,
            useSearch: route.useSearch,
            useParams: route.useParams,
          })
        },
        [route],
      )
    : undefined

  const ResolvedCatchBoundary = errorComponent ? CatchBoundary : SafeFragment

  return (
    <matchesContext.Provider value={matchId}>
      <ResolvedSuspenseBoundary fallback={pendingElement}>
        <ResolvedCatchBoundary
          resetKey={resetKey}
          errorComponent={errorComponent}
          onCatch={() => {
            warning(false, `Error in route match: ${matchId}`)
          }}
        >
          <MatchInner matchId={matchId} pendingElement={pendingElement} />
        </ResolvedCatchBoundary>
      </ResolvedSuspenseBoundary>
    </matchesContext.Provider>
  )
}
function MatchInner({
  matchId,
  pendingElement,
}: {
  matchId: string
  pendingElement: any
}): any {
  const router = useRouter()
  // const unsafeMatch
  const match = useRouterState({
    select: (s) =>
      pick(s.matches.find((d) => d.id === matchId)!, [
        'status',
        'error',
        'showPending',
        'loadPromise',
        'routeId',
      ]),
  })

  const route = router.routesById[match.routeId]!

  if (match.status === 'error') {
    throw match.error
  }

  if (match.status === 'pending') {
    if (match.showPending) {
      return pendingElement || null
    }
    throw match.loadPromise
  }

  if (match.status === 'success') {
    let comp = route.options.component ?? router.options.defaultComponent

    if (comp) {
      return React.createElement(comp, {
        useMatch: route.useMatch,
        useRouteContext: route.useRouteContext as any,
        useSearch: route.useSearch,
        useParams: route.useParams as any,
        useLoaderData: route.useLoaderData,
      })
    }

    return <Outlet />
  }

  invariant(
    false,
    'Idle routeMatch status encountered during rendering! You should never see this. File an issue!',
  )
}

export function Outlet() {
  const router = useRouter()
  const parentMatchId = React.useContext(matchesContext)
  const parentMatchIdIndex = router.state.matches.findIndex(
    (d) => d.id === parentMatchId,
  )

  const nextMatchId = router.state.matches.find((d, i) => {
    return i > parentMatchIdIndex
  })?.id

  if (!nextMatchId) {
    return null
  }

  return <Match matchId={nextMatchId} />
}

export interface MatchRouteOptions {
  pending?: boolean
  caseSensitive?: boolean
  includeSearch?: boolean
  fuzzy?: boolean
}

export type MakeUseMatchRouteOptions<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = '/',
  TMaskTo extends string = '',
> = ToOptions<AnyRoute, TFrom, TTo, TMaskFrom, TMaskTo> & MatchRouteOptions

export function useMatchRoute<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
>() {
  const { matchRoute } = useRouter()

  return React.useCallback(
    <
      TFrom extends RoutePaths<TRouteTree> = '/',
      TTo extends string = '',
      TMaskFrom extends RoutePaths<TRouteTree> = '/',
      TMaskTo extends string = '',
      TResolved extends string = ResolveRelativePath<TFrom, NoInfer<TTo>>,
    >(
      opts: MakeUseMatchRouteOptions<
        TRouteTree,
        TFrom,
        TTo,
        TMaskFrom,
        TMaskTo
      >,
    ): false | RouteById<TRouteTree, TResolved>['types']['allParams'] => {
      const { pending, caseSensitive, ...rest } = opts

      return matchRoute(rest as any, {
        pending,
        caseSensitive,
      })
    },
    [],
  )
}

export type MakeMatchRouteOptions<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = '/',
  TMaskTo extends string = '',
> = ToOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo> &
  MatchRouteOptions & {
    // If a function is passed as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
    children?:
      | ((
          params?: RouteByPath<
            TRouteTree,
            ResolveRelativePath<TFrom, NoInfer<TTo>>
          >['types']['allParams'],
        ) => ReactNode)
      | React.ReactNode
  }

export function MatchRoute<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = '/',
  TMaskTo extends string = '',
>(
  props: MakeMatchRouteOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo>,
): any {
  const matchRoute = useMatchRoute()
  const params = matchRoute(props as any)

  if (typeof props.children === 'function') {
    return (props.children as any)(params)
  }

  return !!params ? props.children : null
}

export function useMatch<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
  TStrict extends boolean = true,
  TRouteMatchState = RouteMatch<TRouteTree, TFrom>,
  TSelected = TRouteMatchState,
>(
  opts: StrictOrFrom<TFrom> & {
    select?: (match: TRouteMatchState) => TSelected
  },
): TStrict extends true ? TSelected : TSelected | undefined {
  // const router = useRouter()
  const nearestMatchId = React.useContext(matchesContext)
  const nearestMatch = useRouterState().matches.find(
    (d) => d.id === nearestMatchId,
  )
  const nearestMatchRouteId = nearestMatch?.routeId

  const matchRouteId = useRouterState({
    select: (state) => {
      const match = opts?.from
        ? state.matches.find((d) => d.routeId === opts?.from)
        : state.matches.find((d) => d.id === nearestMatchId)

      return match!.routeId
    },
  })

  if (opts?.strict ?? true) {
    invariant(
      nearestMatchRouteId == matchRouteId,
      `useMatch("${
        matchRouteId as string
      }") is being called in a component that is meant to render the '${nearestMatchRouteId}' route. Did you mean to 'useMatch("${
        matchRouteId as string
      }", { strict: false })' or 'useRoute("${
        matchRouteId as string
      }")' instead?`,
    )
  }

  const matchSelection = useRouterState({
    select: (state) => {
      const match = opts?.from
        ? state.matches.find((d) => d.routeId === opts?.from)
        : state.matches.find((d) => d.id === nearestMatchId)

      invariant(
        match,
        `Could not find ${
          opts?.from
            ? `an active match from "${opts.from}"`
            : 'a nearest match!'
        }`,
      )

      return opts?.select ? opts.select(match as any) : match
    },
  })

  return matchSelection as any
}

export const matchesContext = React.createContext<string>(null!)

export function useMatches<T = RouteMatch[]>(opts?: {
  select?: (matches: RouteMatch[]) => T
}): T {
  const contextMatches = React.useContext(matchesContext)

  return useRouterState({
    select: (state) => {
      const matches = state.matches.slice(
        state.matches.findIndex((d) => d.id === contextMatches[0]),
      )
      return opts?.select ? opts.select(matches) : (matches as T)
    },
  })
}

export function useLoaderData<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
  TStrict extends boolean = true,
  TRouteMatch extends RouteMatch<TRouteTree, TFrom> = RouteMatch<
    TRouteTree,
    TFrom
  >,
  TSelected = TRouteMatch['loaderData'],
>(
  opts: StrictOrFrom<TFrom> & {
    select?: (match: TRouteMatch) => TSelected
  },
): TStrict extends true ? TSelected : TSelected | undefined {
  const match = useMatch({ ...opts, select: undefined })!

  return typeof opts.select === 'function'
    ? opts.select(match?.loaderData)
    : match?.loaderData
}
