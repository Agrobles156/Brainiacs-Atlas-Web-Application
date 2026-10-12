// import Link from "next/link";
// import Image from "next/image";
// // import { Button } from "@/components/ui/button";
// // import { Skeleton } from "@/components/ui/skeleton";

// // export type CardType;

// const Card = ({ post }: { post: CardType }) => {
//   const {
//     // _createdAt,
//     // views,
//     // author,
//     title,
//     category,
//     _id,
//     image,
//     description,
//   } = post;

//   return (
//     <li className="card group">
//       <div className="flex-between">
//         <div className="flex gap-1.5">
//         </div>
//       </div>

//       <div className="flex-between mt-5 gap-5">
//         <div className="flex-1">
 
//           <Link href={`/research/${_id}`}> // Change
//             <h3 className="text-26-semibold line-clamp-1">{title}</h3>
//           </Link>

//         </div>
//       </div>

//       <Link href={`/research/${_id}`}>
//         <p className="card_desc">{description}</p>

//         <img src={image} alt="placeholder" className="card_img"/>
//       </Link>

//       <div className="flex-between gap-3 mt-5">
//         <Link href={`/?query=${category?.toLowerCase()}`}>
//           <p className="text-16-medium">{category}</p>
//         </Link>

//         <Button className="card_btn" asChild>
//           <Link href={`/research/${_id}`}>Details</Link>
//         </Button>
//       </div>
//     </li>
//   );
// };

// // export const StartupCardSkeleton = () => (
// //   <>
// //     {[0, 1, 2, 3, 4].map((index: number) => (
// //       <li key={cn("skeleton", index)}>
// //         <Skeleton className="startup-card_skeleton" />
// //       </li>
// //     ))}
// //   </>
// // );

// export default Card;