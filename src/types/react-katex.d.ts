declare module 'react-katex' {
  import type { ComponentType } from 'react';

  export type MathComponentProps = {
    math?: string;
    children?: string;
    errorColor?: string;
    renderError?: (error: Error) => React.ReactNode;
  };

  export const InlineMath: ComponentType<MathComponentProps>;
  export const BlockMath: ComponentType<MathComponentProps>;
}
