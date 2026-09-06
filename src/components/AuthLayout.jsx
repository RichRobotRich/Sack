import React from "react";

/**
 * Rahmen für die Seiten vor der Anmeldung.
 *
 * Entweder ein Logo (`logo`) oder ein Symbol (`icon`) über der Überschrift.
 * Das Logo steht frei, das Symbol in einer eingefärbten Kachel – ein Logo
 * darin würde auf dem dunklen Grund untergehen.
 */
export default function AuthLayout({ logo, icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          {logo ? (
            <img src={logo} alt="" className="h-20 w-auto mx-auto mb-4" />
          ) : (
            Icon && (
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mb-4">
                <Icon className="w-7 h-7 text-primary-foreground" aria-hidden="true" />
              </div>
            )
          )}
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
        </div>
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}
