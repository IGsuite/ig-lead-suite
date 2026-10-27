"use client";
import Link from "next/link";
import {buttonVariants} from "@/components/ui/button";
import {Suspense} from "react";
import {useSearchParams} from "next/navigation";
import {LoadingPanel} from "@/components/state-panels";
import CreativesView from "./creatives-view.min.js";
function ProgramLibrary(){const params=useSearchParams();return <><div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--ink-border)] bg-[color:var(--panel)] p-4"><p className="text-sm">Ready to turn a template into a campaign?</p><Link href="/campaigns/new" className={buttonVariants({variant:"default"})}>Create campaign step by step</Link></div><CreativesView initialBrandId={params.get("brandId")} initialPrograms={params.getAll("program")}/></>;}
export default function CreativesPage(){return <Suspense fallback={<LoadingPanel/>}><ProgramLibrary/></Suspense>;}
