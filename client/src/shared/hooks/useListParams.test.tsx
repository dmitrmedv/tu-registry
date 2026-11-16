import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useListParams } from './useListParams';

type Params = { page: number; a: string; b: string };
const DEFAULTS: Params = { page: 1, a: '', b: '' };
const read = (search: URLSearchParams): Params => ({
  page: Number(search.get('page')) || 1,
  a: search.get('a') ?? '',
  b: search.get('b') ?? '',
});
const write = (params: Params) => {
  const search = new URLSearchParams();
  if (params.page !== 1) search.set('page', String(params.page));
  if (params.a) search.set('a', params.a);
  if (params.b) search.set('b', params.b);
  return search;
};

/** The hook inside a real router, starting at `path`; also reports the current URL. */
function renderListParams(path: string) {
  let element: ReactNode = null;
  const router = createMemoryRouter([{ path: '/', element: <Probe /> }], {
    initialEntries: [path],
  });
  function Probe() {
    return element as ReactNode;
  }
  return renderHook(
    () => ({
      list: useListParams({ read, write, defaults: DEFAULTS }),
      search: useLocation().search,
    }),
    {
      wrapper: ({ children }) => {
        element = children;
        return <RouterProvider router={router} />;
      },
    },
  );
}

describe('useListParams', () => {
  it('keeps both of two changes made at the same moment', () => {
    const { result } = renderListParams('/?a=1');

    // Two handlers of one moment (a chip removed, then a select changed) before a re-render.
    act(() => {
      result.current.list.update({ a: '' });
      result.current.list.update({ b: '2' });
    });

    expect(result.current.search).toBe('?b=2');
    expect(result.current.list.params).toEqual({ page: 1, a: '', b: '2' });
  });

  it('starts from page 1 on any change but the page, and resets to the defaults', () => {
    const { result } = renderListParams('/?page=3&a=1');

    act(() => result.current.list.update({ b: '2' }));
    expect(result.current.search).toBe('?a=1&b=2');
    act(() => result.current.list.update({ page: 2 }));
    expect(result.current.search).toBe('?page=2&a=1&b=2');
    act(() => {
      result.current.list.reset();
      result.current.list.update({ a: '9' });
    });
    expect(result.current.search).toBe('?a=9');
  });
});
