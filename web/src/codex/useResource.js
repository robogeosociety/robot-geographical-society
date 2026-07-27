import { useEffect, useState } from 'react';

/**
 * Load one codex resource. `load` is a zero-arg thunk returning a promise; it
 * is re-run whenever `deps` change, and a result that arrives after the
 * component moved on is discarded.
 */
export function useResource(load, deps) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });

  useEffect(() => {
    let live = true;
    setState({ status: 'loading', data: null, error: null });
    load()
      .then((data) => { if (live) setState({ status: 'ready', data, error: null }); })
      .catch((error) => { if (live) setState({ status: 'error', data: null, error }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
