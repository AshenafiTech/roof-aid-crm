"use client";

import { useRouter, useSearchParams } from "next/navigation";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { AuthUser } from "@/lib/types/auth";

import { ActivityTab } from "./activity-tab";
import { AssignmentTab } from "./assignment-tab";
import { DocumentsTab } from "./documents-tab";
import { NotesTab } from "./notes-tab";
import { OverviewTab } from "./overview-tab";
import { PipelineTab } from "./pipeline-tab";
import { SmsTab } from "./sms-tab";
import type { SmsMessage } from "@/components/comms/sms-thread";
import type { SmsTemplate } from "@/components/comms/sms-composer";
import type { DocumentListItem } from "@/lib/queries/documents";
import type {
  ActivityWithUser,
  NoteWithAuthor,
  ProspectWithAssignee,
  UserLite,
} from "./types";

type Props = {
  prospect: ProspectWithAssignee;
  activities: ActivityWithUser[];
  notes: NoteWithAuthor[];
  ruferos: UserLite[];
  currentUser: AuthUser;
  smsMessages: SmsMessage[];
  smsTemplates: SmsTemplate[];
  documents: DocumentListItem[];
};

const VALID_TABS = [
  "overview",
  "pipeline",
  "assignment",
  "activity",
  "notes",
  "sms",
  "documents",
] as const;

type TabValue = (typeof VALID_TABS)[number];

function parseTab(value: string | null): TabValue {
  return (VALID_TABS as readonly string[]).includes(value ?? "")
    ? (value as TabValue)
    : "overview";
}

export function ProspectTabs({
  prospect,
  activities,
  notes,
  ruferos,
  currentUser,
  smsMessages,
  smsTemplates,
  documents,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const current = parseTab(sp.get("tab"));

  function setTab(value: string) {
    const params = new URLSearchParams(sp);
    params.set("tab", value);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <Tabs value={current} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
        <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
        <TabsTrigger value="assignment">Assignment</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
        <TabsTrigger value="notes">Notes</TabsTrigger>
        <TabsTrigger value="sms">SMS</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="pt-4">
        <OverviewTab prospect={prospect} currentUser={currentUser} />
      </TabsContent>
      <TabsContent value="pipeline" className="pt-4">
        <PipelineTab
          prospect={prospect}
          activities={activities}
          currentUser={currentUser}
        />
      </TabsContent>
      <TabsContent value="assignment" className="pt-4">
        <AssignmentTab
          prospect={prospect}
          activities={activities}
          ruferos={ruferos}
          currentUser={currentUser}
        />
      </TabsContent>
      <TabsContent value="activity" className="pt-4">
        <ActivityTab activities={activities} />
      </TabsContent>
      <TabsContent value="notes" className="pt-4">
        <NotesTab prospect={prospect} notes={notes} />
      </TabsContent>
      <TabsContent value="sms" className="pt-4">
        <SmsTab
          prospectId={prospect.id}
          prospectName={prospect.name}
          hasPhone={(prospect.phones ?? []).length > 0}
          isDnc={prospect.do_not_call ?? false}
          initialMessages={smsMessages}
          templates={smsTemplates}
        />
      </TabsContent>
      <TabsContent value="documents" className="pt-4">
        <DocumentsTab
          prospectId={prospect.id}
          prospectName={prospect.name}
          documents={documents}
          currentUserRole={currentUser.role}
        />
      </TabsContent>
    </Tabs>
  );
}
