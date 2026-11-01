import React from 'react';
import climbScene from '../assets/climb-scene.svg';
import './ClimbBackdrop.css';

// The crew climbing toward the trophy (some falling off), behind the login and loading screens.
const ClimbBackdrop = () => (
  <div className="climb-backdrop" aria-hidden="true">
    <img src={climbScene} alt="" />
  </div>
);

export default ClimbBackdrop;
