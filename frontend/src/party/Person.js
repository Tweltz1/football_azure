import React, { memo, useMemo } from 'react';
import { personSvg } from './cartoon.js';
import { parseLook } from './look.js';

/** A party character as an <img>-like block. look: a look object or code. */
const Person = ({ look, pose = 'stand', k = 0, view = 'full', className = '', style }) => {
  const markup = useMemo(() => {
    const value = typeof look === 'string' ? parseLook(look) : look;
    return personSvg(value, { kind: pose, k }, view);
  }, [look, pose, k, view]);
  // eslint-disable-next-line react/no-danger
  return <div className={`lc-person ${className}`} style={style} dangerouslySetInnerHTML={{ __html: markup }} />;
};

export default memo(Person);
