"use client";

import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import "swiper/css/pagination";
import "swiper/css/navigation";
import { Navigation, Pagination } from "swiper/modules";
import React from "react";

const svgs = new Map<string, string>([
    ["level-23", "levels/level-23.svg"],
    ["level-28", "levels/level-28.svg"],
    ["level-29", "levels/level-29.svg"],
    ["level-30", "levels/level-30.svg"]
]);

type SVGCarouselProps = {
  levelClick: (key: string) => void;
}

const SVGCarousel: React.FC<SVGCarouselProps> = ({levelClick}) => {
    return (
      <div className="w-full mx-auto">
        <Swiper
          modules={[Navigation, Pagination]}
          spaceBetween={1}
          breakpoints={{
            640: { slidesPerView: 2 },
            1024: { slidesPerView: 3 },
            1280: { slidesPerView: 4 },
          }}
          navigation
          pagination={{ clickable: true }}
          className="w-full"
        >
          {Array.from(svgs.entries()).map(([key, value]) => (
            <SwiperSlide key={key}>
              <div className="bg-gray rounded-xl shadow-sm overflow-hidden flex flex-col items-center m-1 border-2 border-black-400">
                <h4 className="text-md font-semibold pt-2">{key}</h4>
                <img src={value} alt={key} className="w-full h-48 object-contain" onClick={() => levelClick(key)}/>
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    );
  };
  
  export default SVGCarousel;
