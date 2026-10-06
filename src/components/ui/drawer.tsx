import * as React from "react";
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { cn } from "@/lib/cn";

interface DrawerContextValue {
  hasSnapPoints: boolean;
  modal: DrawerPrimitive.Root.Props["modal"];
  showSwipeHandle: boolean;
}

const DrawerContext = React.createContext<DrawerContextValue | null>(null);

function useDrawer(): DrawerContextValue {
  const context = React.useContext(DrawerContext);
  if (!context) throw new Error("useDrawer must be used within a Drawer");
  return context;
}

function Drawer({
  modal = true,
  showSwipeHandle = true,
  snapPoints,
  ...props
}: DrawerPrimitive.Root.Props & { showSwipeHandle?: boolean }) {
  const value = React.useMemo(
    () => ({ hasSnapPoints: Boolean(snapPoints?.length), modal, showSwipeHandle }),
    [modal, showSwipeHandle, snapPoints],
  );
  return (
    <DrawerContext.Provider value={value}>
      <DrawerPrimitive.Root modal={modal} snapPoints={snapPoints} swipeDirection="down" {...props} />
    </DrawerContext.Provider>
  );
}

function DrawerTrigger(props: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal(props: DrawerPrimitive.Portal.Props) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerClose(props: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerOverlay({ className, ...props }: DrawerPrimitive.Backdrop.Props) {
  return <DrawerPrimitive.Backdrop data-slot="drawer-overlay" className={cn("drawer-overlay", className)} {...props} />;
}

function DrawerSwipeHandle({ className, ...props }: React.ComponentProps<"i">) {
  return <i data-slot="drawer-swipe-handle" aria-hidden="true" className={cn("drawer-swipe-handle", className)} {...props} />;
}

function DrawerContent({ className, children, ...props }: DrawerPrimitive.Popup.Props) {
  const { hasSnapPoints, modal, showSwipeHandle } = useDrawer();
  return (
    <DrawerPortal>
      {modal === true ? <DrawerOverlay data-snap-points={hasSnapPoints ? "" : undefined} /> : null}
      <DrawerPrimitive.Viewport data-slot="drawer-viewport" data-modal={modal} className="drawer-viewport">
        <DrawerPrimitive.Popup
          data-slot="drawer-popup"
          data-swipe-axis="y"
          data-snap-points={hasSnapPoints ? "" : undefined}
          className={cn("drawer-popup", className)}
          {...props}
        >
          {showSwipeHandle ? <DrawerSwipeHandle /> : null}
          <DrawerPrimitive.Content data-slot="drawer-content" className="drawer-body">
            {children}
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPortal>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"header">) {
  return <header data-slot="drawer-header" className={cn("drawer-header", className)} {...props} />;
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"footer">) {
  return <footer data-slot="drawer-footer" className={cn("drawer-footer", className)} {...props} />;
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return <DrawerPrimitive.Title data-slot="drawer-title" className={cn("drawer-title", className)} {...props} />;
}

function DrawerDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return <DrawerPrimitive.Description data-slot="drawer-description" className={cn("drawer-description", className)} {...props} />;
}

export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerSwipeHandle,
  DrawerTitle,
  DrawerTrigger,
};
