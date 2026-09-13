/**
 * SectionHeader.jsx
 *
 * Consistent page/section heading with optional subtitle and right-side action slot.
 *
 * Props:
 *   title    {string}        — primary heading text
 *   subtitle {string}        — optional supporting text
 *   action   {React.node}    — optional element rendered on the right (button, badge…)
 */

import React from 'react';

function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="pf-section-header">
      <div className="pf-section-header-left">
        <h1 className="pf-section-title">{title}</h1>
        {subtitle && <p className="pf-section-subtitle">{subtitle}</p>}
      </div>
      {action && <div className="pf-section-header-action">{action}</div>}
    </div>
  );
}

export default SectionHeader;
