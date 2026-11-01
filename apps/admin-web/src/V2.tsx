import React, { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  message,
} from "antd";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { money } from "@localkart/shared";
import { colors } from "@localkart/design-tokens";
export const v2Sections = [
  "dashboard",
  "analytics",
  "deliveries",
  "commissions",
  "support",
  "refunds",
  "notifications",
];
const labels: Record<string, string> = {
  customers: "Customers",
  merchants: "Merchants",
  approvedShops: "Approved shops",
  pendingApprovals: "Pending approvals",
  activeShops: "Active shops",
  totalOrders: "Total orders",
  cancelledOrders: "Cancelled orders",
  pickupOrders: "Pickup orders",
  deliveryOrders: "Delivery orders",
  gmvPaise: "Completed merchandise GMV",
  grossPlatformFeesPaise: "Gross platform fees",
  netPlatformRevenuePaise: "Net platform fee revenue",
  deliveryFeesQuotedPaise: "Delivery charges quoted",
  refundsPaise: "Recorded refunds",
  averageOrderValuePaise: "Average merchandise order value",
  cancellationRate: "Cancellation rate",
};
export function V2Workspace({ section, api }: any) {
  if (section === "notifications") return <NotificationMonitor api={api} />;
  return <OperationsWorkspace section={section} api={api} />;
}
function OperationsWorkspace({ section, api }: any) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("RIDER_ASSIGNED");
  const [rider, setRider] = useState("");
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [selected, setSelected] = useState("");
  const [collected, setCollected] = useState(false);
  const [returned, setReturned] = useState(false);
  const [discard, setDiscard] = useState(false);
  const eventKeys = useRef(new Map<string, string>());
  const path =
    section === "deliveries"
      ? "/admin/deliveries"
      : section === "commissions"
        ? "/admin/commissions"
        : section === "support"
          ? "/support/tickets"
          : section === "refunds"
            ? "/admin/refunds"
            : "/admin/analytics";
  const query = useQuery({
    queryKey: ["v2-admin", path],
    queryFn: () => api(path),
    refetchInterval: 15000,
  });
  const mutate = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries();
      message.success("Saved");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (query.error)
    return (
      <Alert
        type="error"
        message={query.error.message}
        action={<Button onClick={() => query.refetch()}>Retry</Button>}
      />
    );
  const data = query.data;
  if (section === "dashboard" || section === "analytics")
    return (
      <>
        <div className="stats">
          {data &&
            Object.entries(data)
              .filter(([k]) => k !== "daily")
              .map(([k, v]) => (
                <Card key={k}>
                  <Statistic
                    title={labels[k] || k}
                    value={
                      k.endsWith("Paise")
                        ? money(Number(v))
                        : k === "cancellationRate"
                          ? (Number(v) * 100).toFixed(1) + "%"
                          : Number(v)
                    }
                  />
                </Card>
              ))}
        </div>
        <Card
          title="Completed marketplace sales — India business day"
          style={{ marginTop: 24 }}
        >
          <Alert
            type="info"
            message="GMV is customer merchandise spend; it is not company revenue."
            description="Platform fee revenue excludes quoted delivery charges and is reduced by recorded refunds. Simulation and manual pilot records must be reconciled before financial reporting."
          />
          {data?.daily?.length ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data.daily}>
                <XAxis dataKey="date" />
                <YAxis tickFormatter={(v) => "₹" + Number(v) / 100} />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Legend />
                <Bar
                  name="Merchandise GMV"
                  isAnimationActive={false}
                  dataKey="gmvPaise"
                  fill={colors.primary}
                />
                <Bar
                  name="Platform fees"
                  isAnimationActive={false}
                  dataKey="feesPaise"
                  fill={colors.text}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p>No completed sales in the last seven days.</p>
          )}
        </Card>
      </>
    );
  if (section === "commissions")
    return (
      <>
        <Card title="Configure future-order commission">
          <Alert
            type="info"
            message="Changes affect new orders only. Existing fee snapshots remain immutable."
          />
          <Form
            layout="inline"
            style={{ marginTop: 20 }}
            onFinish={(values) =>
              void mutate(() => api("/admin/commissions", "POST", values))
            }
          >
            <Form.Item name="shopId" label="Shop ID">
              <Input placeholder="Blank for global" />
            </Form.Item>
            <Form.Item
              name="basisPoints"
              label="Basis points"
              rules={[{ required: true }]}
            >
              <InputNumber min={0} max={10000} placeholder="500 = 5%" />
            </Form.Item>
            <Form.Item name="minimumFeePaise" label="Minimum fee (paise)">
              <InputNumber min={0} />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={busy}>
              Save rule
            </Button>
          </Form>
        </Card>
        <Table
          style={{ marginTop: 20 }}
          loading={query.isLoading}
          rowKey="id"
          dataSource={data || []}
          columns={[
            {
              title: "Scope",
              render: (_, r: any) => r.shopId || r.categoryId || "Global",
            },
            { title: "Basis points", dataIndex: "basisPoints" },
            { title: "Minimum fee (paise)", dataIndex: "minimumFeePaise" },
            {
              title: "Active",
              render: (_, r: any) => (r.active ? "Yes" : "No"),
            },
          ]}
        />
      </>
    );
  if (section === "deliveries")
    return (
      <>
        <Alert
          type="warning"
          message="Pilot dispatch console"
          description="MOCK bookings are development simulations. Record rider handover separately from successful delivery. Never request the customer’s code before the order is received."
        />
        <Card
          title="Record an audited delivery event"
          style={{ marginTop: 20 }}
        >
          <Space wrap>
            <Select
              style={{ width: 260 }}
              placeholder="Select delivery order"
              value={selected || undefined}
              onChange={setSelected}
              options={(data || []).map((d: any) => ({
                value: d.orderId,
                label:
                  d.order.shop.name +
                  " · " +
                  d.orderId.slice(0, 8) +
                  " · " +
                  d.status,
              }))}
            />
            <Select
              value={status}
              onChange={setStatus}
              style={{ width: 220 }}
              options={[
                "RIDER_ASSIGNED",
                "RIDER_PICKED_UP",
                "OUT_FOR_DELIVERY",
                "DELIVERED",
                "DELIVERY_FAILED",
                "CANCELLED",
              ].map((value) => ({ value, label: value.replaceAll("_", " ") }))}
            />
            <Input
              placeholder="Rider name (assignment)"
              value={rider}
              onChange={(e) => setRider(e.target.value)}
            />
            <Input
              placeholder="Dispatch note / return evidence"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Input
              placeholder="Customer delivery code"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value)}
            />
            <Checkbox
              checked={collected}
              onChange={(e) => setCollected(e.target.checked)}
            >
              Cash collected
            </Checkbox>
            <Checkbox
              checked={returned}
              onChange={(e) => setReturned(e.target.checked)}
            >
              Return to shop confirmed
            </Checkbox>
            <Checkbox
              checked={discard}
              onChange={(e) => setDiscard(e.target.checked)}
            >
              Returned stock is damaged / discard
            </Checkbox>
            <Button
              type="primary"
              loading={busy}
              disabled={!selected || note.length < 5}
              onClick={() =>
                void mutate(async () => {
                  const payload = {
                    orderId: selected,
                    status,
                    note,
                    ...(rider ? { riderName: rider } : {}),
                    ...(code ? { code } : {}),
                    collected,
                    returned,
                    discardReturned: discard,
                  };
                  const fingerprint = JSON.stringify(payload);
                  const eventId =
                    eventKeys.current.get(fingerprint) || crypto.randomUUID();
                  eventKeys.current.set(fingerprint, eventId);
                  await api("/delivery/events", "POST", {
                    ...payload,
                    eventId,
                  });
                  eventKeys.current.delete(fingerprint);
                })
              }
            >
              Record verified event
            </Button>
          </Space>
        </Card>
        <Table
          rowKey="id"
          style={{ marginTop: 20 }}
          loading={query.isLoading}
          dataSource={data || []}
          expandable={{
            expandedRowRender: (d: any) => (
              <>
                <p>
                  {d.addressSnapshot.recipient} · {d.addressSnapshot.line1},{" "}
                  {d.addressSnapshot.locality}
                </p>
                {d.events.map((e: any) => (
                  <p key={e.id}>
                    {e.status} · {e.note} ·{" "}
                    {new Date(e.createdAt).toLocaleString("en-IN")}
                  </p>
                ))}
              </>
            ),
          }}
          columns={[
            { title: "Shop", render: (_, d: any) => d.order.shop.name },
            {
              title: "Provider",
              dataIndex: "provider",
              render: (v) => (
                <Tag color={v === "MOCK" ? "orange" : "blue"}>{v}</Tag>
              ),
            },
            { title: "Delivery state", dataIndex: "status" },
            { title: "Order state", render: (_, d: any) => d.order.status },
            { title: "Rider", dataIndex: "riderName" },
            { title: "Proof", dataIndex: "proofReference" },
          ]}
          scroll={{ x: true }}
        />
      </>
    );
  const refunds = section === "refunds";
  return (
    <Table
      rowKey="id"
      loading={query.isLoading}
      dataSource={data || []}
      scroll={{ x: true }}
      columns={
        refunds
          ? [
              { title: "Order", dataIndex: "orderId" },
              { title: "Amount", dataIndex: "amountPaise", render: money },
              { title: "Reason", dataIndex: "reason" },
              { title: "State", dataIndex: "status" },
              {
                title: "Resolution",
                render: (_, r: any) => (
                  <Form
                    onFinish={(values) =>
                      void mutate(() =>
                        api("/admin/refunds/" + r.id, "PATCH", values),
                      )
                    }
                  >
                    <Space wrap>
                      <Form.Item
                        name="resolution"
                        rules={[{ required: true, min: 8 }]}
                      >
                        <Input placeholder="Resolution / reimbursement reference" />
                      </Form.Item>
                      <Form.Item name="action" initialValue="APPROVE">
                        <Select
                          style={{ width: 200 }}
                          options={[
                            {
                              value: "APPROVE",
                              label: "Approve review / simulation",
                            },
                            { value: "REJECT", label: "Reject request" },
                            {
                              value: "CONFIRM_MANUAL_REFUND",
                              label: "Confirm actual manual refund",
                            },
                          ]}
                        />
                      </Form.Item>
                      <Button
                        htmlType="submit"
                        disabled={
                          !["REQUESTED", "MANUAL_REQUIRED"].includes(r.status)
                        }
                        loading={busy}
                      >
                        Save
                      </Button>
                    </Space>
                  </Form>
                ),
              },
            ]
          : [
              { title: "Subject", dataIndex: "subject" },
              { title: "Details", dataIndex: "body" },
              { title: "State", dataIndex: "status" },
              {
                title: "Resolution",
                render: (_, t: any) => (
                  <Form
                    onFinish={(values) =>
                      void mutate(() =>
                        api("/admin/support/" + t.id, "PATCH", {
                          ...values,
                          status: "RESOLVED",
                        }),
                      )
                    }
                  >
                    <Space>
                      <Form.Item
                        name="resolution"
                        rules={[{ required: true, min: 5 }]}
                      >
                        <Input placeholder="Resolution details" />
                      </Form.Item>
                      <Button htmlType="submit" loading={busy}>
                        Resolve
                      </Button>
                    </Space>
                  </Form>
                ),
              },
            ]
      }
    />
  );
}

function NotificationMonitor({ api }: any) {
  const qc = useQueryClient();
  const [device, setDevice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const events = useQuery({
    queryKey: ["admin-notifications"],
    queryFn: () => api("/admin/notifications"),
    refetchInterval: 5000,
  });
  const devices = useQuery({
    queryKey: ["notification-test-devices"],
    queryFn: () => api("/admin/notification-test-devices"),
  });
  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Alert
        type="info"
        message="Queue and provider receipts are shown below. A provider receipt does not confirm display on a physical device. Live order updates also use authenticated sockets and polling."
      />
      <Card title="Registered test device">
        <Space>
          <Select
            style={{ minWidth: 280 }}
            placeholder="Choose an opted-in test device"
            value={device}
            onChange={setDevice}
            options={(devices.data || []).map((d: any) => ({
              value: d.id,
              label: `${d.user.name} · ${d.user.role} · ${d.platform}`,
            }))}
          />
          <Button
            disabled={!device || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await api("/admin/notifications/test", {
                  method: "POST",
                  body: JSON.stringify({ deviceId: device }),
                });
                message.info(
                  result.pushEnabled
                    ? "Test queued; inspect provider receipt and device."
                    : "Test queued. Push dispatch is disabled in server configuration.",
                );
                await qc.invalidateQueries({
                  queryKey: ["admin-notifications"],
                });
              } catch (e) {
                message.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Queue test notification
          </Button>
        </Space>
      </Card>
      {events.error && <Alert type="error" message={events.error.message} />}
      <Table
        rowKey="id"
        loading={events.isLoading}
        dataSource={events.data || []}
        expandable={{
          expandedRowRender: (n: any) => (
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {JSON.stringify(
                {
                  eventId: n.eventId,
                  orderId: n.orderId,
                  deliveries: n.deliveries,
                },
                null,
                2,
              )}
            </pre>
          ),
        }}
        columns={[
          {
            title: "Created",
            dataIndex: "createdAt",
            render: (v: string) => new Date(v).toLocaleString(),
          },
          { title: "Recipient", render: (_: any, n: any) => n.user.role },
          { title: "Event", dataIndex: "type" },
          { title: "Title", dataIndex: "title" },
          {
            title: "Outbox",
            render: (_: any, n: any) => (
              <Tag>{n.outbox?.status || "LEGACY"}</Tag>
            ),
          },
          {
            title: "Device jobs",
            render: (_: any, n: any) =>
              n.deliveries.map((d: any) => (
                <Tag key={d.id}>
                  {d.status} · attempts {d.attemptCount}
                </Tag>
              )),
          },
        ]}
      />
    </Space>
  );
}
