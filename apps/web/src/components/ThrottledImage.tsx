import { type ImgHTMLAttributes } from 'react';
import Img from 'react-cool-img';

type ThrottledImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string;
};

export function ThrottledImage({ src, ...props }: ThrottledImageProps) {
  return (
    <Img
      {...props}
      src={src}
      lazy
      cache
      decode
      debounce={250}
      retry={{ count: 2, delay: 1, acc: '+' }}
    />
  );
}
