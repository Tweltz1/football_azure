import React, { useEffect, useState } from 'react';
import { onSoundOffChange, setSoundOff, soundOff } from '../sound/crewSound';

// Speaker button for the signed-out screen's music and sound effects; the choice is remembered on this device.
const SoundToggle = () => {
  const [off, setOff] = useState(soundOff);
  useEffect(() => onSoundOffChange(setOff), []);
  return (
    <button
      type="button"
      className="sound-toggle"
      aria-label={off ? 'Turn sound on' : 'Turn sound off'}
      aria-pressed={!off}
      onClick={(event) => { event.stopPropagation(); setSoundOff(!off); }}
    >
      <span aria-hidden="true">{off ? '🔇' : '🔊'}</span>
    </button>
  );
};

export default SoundToggle;
