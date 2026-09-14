'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Descriptions, Image, Input, Modal, Spin, Typography, message } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined, EyeOutlined, FileImageOutlined, UploadOutlined } from '@ant-design/icons';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { attachmentApi, authApi, getErrorMessage, imageTaskApi, type ImageTaskDetail, type ImageTaskDetailAttachment } from '@/lib/api';
import { formatShanghaiDateTime } from '@/lib/shanghai-week';
import { useDashboardRefresh } from '@/hooks/useDashboardRefresh';
import { useAttachmentImages } from '@/hooks/useAttachmentImages';
import { DetailSection, SecondaryEmptyState, SecondaryErrorState, SecondaryPageHeader, SecondaryPageShell, SecondaryStatusTag } from '@/components/secondary-page';
import styles from './page.module.css';

const { Paragraph, Text } = Typography;

const reviewActionLabels: Record<string, string> = {
  design_review_submitted: '提交设计主管审核',
  design_review_resubmitted: '重新提交设计主管审核',
  design_review_rejected: '退回修改',
  design_review_approved: '审核通过',
  submit_design_review: '提交设计主管审核',
  resubmit_design_review: '重新提交设计主管审核',
  design_review_reject: '退回修改',
  design_review_approve: '审核通过',
  review_reject: '退回修改',
  review_approve: '审核通过',
};

const reviewSubmissionActions = new Set([
  'design_review_submitted',
  'design_review_resubmitted',
  'submit_design_review',
  'resubmit_design_review',
  'submit_review',
]);

function isImageAttachment(attachment: ImageTaskDetailAttachment) {
  return attachment.mimeType.toLowerCase().startsWith('image/');
}

function formatFileSize(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function unwrapDetail(response: { data: ImageTaskDetail | { data: ImageTaskDetail } }) {
  const payload = response.data as ImageTaskDetail | { data: ImageTaskDetail };
  return 'data' in payload ? payload.data : payload;
}

function ReferenceThumbnail({ attachment, loadImage, onOpen }: { attachment: ImageTaskDetailAttachment; loadImage: (attachment: ImageTaskDetailAttachment) => Promise<string>; onOpen: () => void }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setUrl('');
    setFailed(false);
    loadImage(attachment).then(value => { if (active) setUrl(value); }, () => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [attachment.id, loadImage]);
  return <button type="button" onClick={onOpen} aria-label={`预览参考图 ${attachment.fileName}`} style={{ width: 118, height: 86, padding: 0, border: '1px solid #e5e7eb', background: '#fafafa', cursor: 'pointer' }}>
    {url ? <img src={url} alt={attachment.fileName} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : failed ? '加载失败，点击重试' : <Spin size="small" />}
  </button>;
}

export default function ImageTaskDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskId = Number(params?.id);
  const [detail, setDetail] = useState<ImageTaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: number; role: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectRemark, setRejectRemark] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const hasDetailRef = useRef(false);
  const actionRunningRef = useRef(false);
  const uploadRunningRef = useRef(false);
  const submitRunningRef = useRef(false);
  const rejectRunningRef = useRef(false);
  const approveRunningRef = useRef(false);
  const completedArtworkInputRef = useRef<HTMLInputElement | null>(null);
  const loadAttachmentImage = useAttachmentImages();

  const loadDetail = useCallback(async (showLoading = false) => {
    if (!Number.isInteger(taskId) || taskId <= 0) {
      setErrorStatus(404);
      setError('图片任务不存在或已被删除');
      setLoading(false);
      return;
    }

    if (showLoading && !hasDetailRef.current) setLoading(true);
    try {
      const response = await imageTaskApi.findOne(taskId);
      const nextDetail = unwrapDetail(response);
      hasDetailRef.current = true;
      setDetail(nextDetail);
      setError(null);
      setErrorStatus(null);
    } catch (requestError: any) {
      const status = requestError?.response?.status ?? null;
      setErrorStatus(status);
      setError(status === 404
        ? '图片任务不存在或已被删除'
        : status === 403
          ? '当前账号无权访问该图片任务'
          : getErrorMessage(requestError, '图片任务详情暂时无法加载'));
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void loadDetail(true);
  }, [loadDetail]);

  useEffect(() => {
    let active = true;
    void authApi.getMe()
      .then((response) => {
        if (!active) return;
        const payload = response.data?.data || response.data;
        setCurrentUser({ id: Number(payload.id), role: String(payload.role || '') });
      })
      .catch(() => {
        if (active) setCurrentUser(null);
      });
    return () => { active = false; };
  }, []);


  const refreshCore = useCallback(async () => {
    if (errorStatus === 403 || errorStatus === 404) return;
    await loadDetail(false);
  }, [errorStatus, loadDetail]);
  useDashboardRefresh({ refreshCore });

  const returnPath = (() => {
    const requestedPath = searchParams.get('returnTo');
    if (requestedPath?.startsWith('/dashboard/')) return requestedPath;
    return detail ? `/dashboard/fazhi/${detail.decree.id}` : '/dashboard/fazhi';
  })();

  const downloadAttachment = async (attachment: ImageTaskDetailAttachment) => {
    try {
      const response = await attachmentApi.download(attachment.id);
      const url = window.URL.createObjectURL(new Blob([response.data], { type: attachment.mimeType }));
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (requestError) {
      message.error(getErrorMessage(requestError, '下载失败，请稍后重试'));
    }
  };

  const previewAttachment = async (attachment: ImageTaskDetailAttachment) => {
    if (!isImageAttachment(attachment)) {
      message.info('该文件暂不支持在线预览，请下载查看');
      return;
    }
    try {
      const url = await loadAttachmentImage(attachment);
      setPreview({ url, title: attachment.fileName });
    } catch (requestError) {
      message.error(getErrorMessage(requestError, '预览失败，请稍后重试'));
    }
  };

  const attachmentList = (attachments: ImageTaskDetailAttachment[], emptyText: string) => {
    if (!attachments.length) return <SecondaryEmptyState description={emptyText} />;
    return (
      <div className={styles.attachmentGrid}>
        {attachments.map((attachment) => (
          <article className={`${styles.attachmentCard} ${attachment.category === 'IMAGE_REFERENCE' && isImageAttachment(attachment) ? styles.referenceAttachmentCard : ''}`} key={attachment.id}>
            {attachment.category === 'IMAGE_REFERENCE' && isImageAttachment(attachment)
              ? <ReferenceThumbnail attachment={attachment} loadImage={loadAttachmentImage} onOpen={() => void previewAttachment(attachment)} />
              : <div className={styles.attachmentIcon}><FileImageOutlined /></div>}
            <div className={styles.attachmentMeta}>
              <strong title={attachment.fileName}>{attachment.fileName}</strong>
              <span>{formatFileSize(attachment.fileSize)} · {attachment.mimeType || '-'}</span>
              <span>{formatShanghaiDateTime(attachment.createdAt) || '-'}</span>
            </div>
            <div className={styles.attachmentActions}>
              {isImageAttachment(attachment) ? <Button size="small" icon={<EyeOutlined />} onClick={() => void previewAttachment(attachment)}>预览</Button> : null}
              <Button size="small" icon={<DownloadOutlined />} onClick={() => void downloadAttachment(attachment)}>下载</Button>
            </div>
          </article>
        ))}
      </div>
    );
  };

  if (loading && !detail) {
    return <SecondaryPageShell><div className={styles.loadingState}><Spin size="large" /><span>正在加载图片任务详情…</span></div></SecondaryPageShell>;
  }

  if (!detail) {
    const statusMessage = errorStatus === 404
      ? '图片任务不存在或已被删除'
      : errorStatus === 403
        ? '当前账号无权访问该图片任务'
        : (error || '图片任务详情暂时无法加载');
    return (
      <SecondaryPageShell>
        <SecondaryErrorState
          message={statusMessage}
          action={<Button onClick={() => void loadDetail(true)}>重试</Button>}
        />
      </SecondaryPageShell>
    );
  }

  const originalAttachments = detail.sourceAttachments.filter((attachment) => attachment.category === 'IMAGE_ORIGINAL');
  const referenceAttachments = detail.sourceAttachments.filter((attachment) => attachment.category === 'IMAGE_REFERENCE');
  const isAssignedDesigner = currentUser?.role === 'DESIGNER' && detail.people.designer?.id === currentUser.id;
  const isDesignerActionStatus = ['NOT_STARTED', 'IN_PROGRESS', 'REVISION_REQUIRED', 'SUBMITTED_FOR_REVIEW', 'APPROVED', 'COMPLETED'].includes(detail.status);
  const canStartDesign = isAssignedDesigner && detail.status === 'NOT_STARTED';
  const canUploadCompletedArtwork = isAssignedDesigner && ['IN_PROGRESS', 'REVISION_REQUIRED'].includes(detail.status);
  const currentCompletedAttachment = detail.completedAttachments[0] || null;
  const canSubmitReview = isAssignedDesigner
    && ['IN_PROGRESS', 'REVISION_REQUIRED'].includes(detail.status)
    && Boolean(currentCompletedAttachment);
  const canReviewImageTask = ['DESIGN_MANAGER', 'OWNER', 'SUPER_ADMIN'].includes(currentUser?.role || '')
    && detail.status === 'SUBMITTED_FOR_REVIEW';
  const latestSubmissionWithAttachment = [...detail.reviewHistory]
    .reverse()
    .find((record) => reviewSubmissionActions.has(record.action) && Number.isInteger(record.submittedAttachmentId));
  const submittedAttachment = latestSubmissionWithAttachment?.submittedAttachmentId
    ? detail.completedAttachments.find((attachment) => attachment.id === latestSubmissionWithAttachment.submittedAttachmentId) || null
    : null;
  const currentReviewAttachment = submittedAttachment || currentCompletedAttachment;
  const canApproveReview = canReviewImageTask && Boolean(submittedAttachment);
  const usesLegacyReviewAttachmentFallback = Boolean(currentReviewAttachment && !submittedAttachment);
  const latestRevisionReason = [...detail.reviewHistory]
    .reverse()
    .find((record) => ['design_review_rejected', 'design_review_reject', 'review_reject'].includes(record.action) && record.reason?.trim())
    ?.reason?.trim();

  const startDesign = async () => {
    if (!canStartDesign || actionRunningRef.current) return;
    actionRunningRef.current = true;
    setActionLoading(true);
    try {
      await imageTaskApi.start(taskId);
      await loadDetail(false);
      window.dispatchEvent(new Event('tianji:dashboard-refresh'));
      message.success('已开始设计');
    } catch (requestError) {
      message.error(getErrorMessage(requestError, '开始设计失败，请稍后重试'));
    } finally {
      actionRunningRef.current = false;
      setActionLoading(false);
    }
  };

  const uploadCompletedArtwork = async (file: File | null) => {
    if (!file || !canUploadCompletedArtwork || uploadRunningRef.current) return;
    uploadRunningRef.current = true;
    setUploadLoading(true);
    try {
      await attachmentApi.uploadImageTask(taskId, 'IMAGE_COMPLETED', file);
      await loadDetail(false);
      window.dispatchEvent(new Event('tianji:dashboard-refresh'));
      message.success('完成稿已上传');
    } catch (requestError) {
      message.error(getErrorMessage(requestError, '完成稿上传失败，请稍后重试'));
    } finally {
      if (completedArtworkInputRef.current) completedArtworkInputRef.current.value = '';
      uploadRunningRef.current = false;
      setUploadLoading(false);
    }
  };

  const submitReview = async () => {
    if (!canSubmitReview || submitRunningRef.current) return;
    submitRunningRef.current = true;
    setSubmitLoading(true);
    try {
      await imageTaskApi.submitReview(taskId);
      await loadDetail(false);
      window.dispatchEvent(new Event('tianji:dashboard-refresh'));
      message.success(detail.status === 'REVISION_REQUIRED' ? '已重新提交设计主管审核' : '已提交设计主管审核');
    } catch (requestError) {
      message.error(getErrorMessage(requestError, '提交审核失败，请稍后重试'));
    } finally {
      submitRunningRef.current = false;
      setSubmitLoading(false);
    }
  };

  const rejectReview = async () => {
    const remark = rejectRemark.trim();
    if (!canReviewImageTask || rejectRunningRef.current) return;
    if (!remark) {
      message.warning('请填写退回原因');
      return;
    }

    rejectRunningRef.current = true;
    setRejectLoading(true);
    try {
      await imageTaskApi.rejectReview(taskId, remark);
      await loadDetail(false);
      window.dispatchEvent(new Event('tianji:dashboard-refresh'));
      setRejectModalOpen(false);
      setRejectRemark('');
      message.success('已退回修改');
    } catch (requestError) {
      message.error(getErrorMessage(requestError, '退回修改失败，请稍后重试'));
    } finally {
      rejectRunningRef.current = false;
      setRejectLoading(false);
    }
  };

  const approveReview = async () => {
    if (!canApproveReview || approveRunningRef.current) return;
    approveRunningRef.current = true;
    setApproveLoading(true);
    try {
      await imageTaskApi.approveReview(taskId);
      await loadDetail(false);
      window.dispatchEvent(new Event('tianji:dashboard-refresh'));
      setApproveModalOpen(false);
      message.success('已审核通过');
    } catch (requestError) {
      message.error(getErrorMessage(requestError, '审核通过失败，请稍后重试'));
    } finally {
      approveRunningRef.current = false;
      setApproveLoading(false);
    }
  };

  return (
    <SecondaryPageShell>
      <SecondaryPageHeader
        breadcrumb={<span>工作台 / 图片任务详情</span>}
        title={detail.name || `图片任务 #${detail.imageIndex}`}
        subtitle={`所属法旨 ${detail.decree.serialNumber || '-'} · ${detail.decree.productCode || '-'}`}
        meta={<div className={styles.headerMeta}><SecondaryStatusTag status={detail.status} /><span>店铺：{detail.decree.store?.name || '-'}</span><span>设计师：{detail.people.designer?.displayName || '-'}</span><span>最近更新：{formatShanghaiDateTime(detail.updatedAt) || '-'}</span></div>}
        actions={[{ key: 'back', label: '返回', icon: <ArrowLeftOutlined />, onClick: () => router.push(returnPath) }]}
      />

      {error ? <div className={styles.refreshWarning}><Text type="warning">{error}，当前展示上一次成功加载的数据。</Text></div> : null}

      {canReviewImageTask ? (
        <DetailSection title="设计主管审核">
          <div className={styles.reviewActionPanel}>
            <div className={styles.reviewActionCopy}>
              <SecondaryStatusTag status={detail.status} />
              <p>请确认当前提交版本后处理。</p>
              {currentReviewAttachment ? (
                <div className={styles.reviewedArtwork}>
                  <div className={styles.reviewedArtworkMeta}>
                    <span>当前审核版本</span>
                    <strong>附件 #{currentReviewAttachment.id} · {currentReviewAttachment.fileName}</strong>
                    <small>{formatShanghaiDateTime(currentReviewAttachment.createdAt) || '-'}{usesLegacyReviewAttachmentFallback ? ' · 历史提交未记录版本 ID，按当前完成稿展示' : ' · 已按提交记录绑定'}</small>
                  </div>
                  <div className={styles.attachmentActions}>
                    {isImageAttachment(currentReviewAttachment) ? <Button size="small" icon={<EyeOutlined />} onClick={() => void previewAttachment(currentReviewAttachment)}>预览</Button> : null}
                    <Button size="small" icon={<DownloadOutlined />} onClick={() => void downloadAttachment(currentReviewAttachment)}>下载</Button>
                  </div>
                </div>
              ) : <SecondaryEmptyState description="当前提交版本暂时无法确认" />}
            </div>
            <div className={styles.designerActionControls}>
              <Button type="primary" loading={approveLoading} disabled={!canApproveReview || approveLoading || rejectLoading} onClick={() => setApproveModalOpen(true)}>
                审核通过
              </Button>
              <Button danger loading={rejectLoading} disabled={rejectLoading || approveLoading} onClick={() => setRejectModalOpen(true)}>
                退回修改
              </Button>
            </div>
          </div>
        </DetailSection>
      ) : null}

      {isAssignedDesigner && isDesignerActionStatus ? (
        <DetailSection title="设计操作">
          <div className={styles.designerActionPanel}>
            <div className={styles.designerActionCopy}>
              <SecondaryStatusTag status={detail.status} />
              {detail.status === 'NOT_STARTED' ? <p>任务已分配，可开始设计。</p> : null}
              {detail.status === 'IN_PROGRESS' ? <p>任务正在制作中。</p> : null}
              {detail.status === 'REVISION_REQUIRED' ? (
                <>
                  <p>请根据退回意见修改完成稿后重新提交。</p>
                  <div className={styles.revisionReason}>
                    <span>退回原因</span>
                    <strong>{latestRevisionReason || '暂无可展示的退回原因'}</strong>
                  </div>
                </>
              ) : null}
              {detail.status === 'SUBMITTED_FOR_REVIEW' ? <p>已提交审核，请等待设计主管处理。</p> : null}
              {detail.status === 'APPROVED' ? <p>审核已通过，当前任务为只读状态。</p> : null}
              {detail.status === 'COMPLETED' ? <p>任务已完成，当前任务为只读状态。</p> : null}
              {isAssignedDesigner && ['IN_PROGRESS', 'REVISION_REQUIRED'].includes(detail.status) && !currentCompletedAttachment ? (
                <p className={styles.submitHint}>请先上传完成稿后再提交审核</p>
              ) : null}
            </div>
            <div className={styles.designerActionControls}>
              {canStartDesign ? (
                <Button type="primary" loading={actionLoading} disabled={actionLoading} onClick={() => void startDesign()}>
                  开始设计
                </Button>
              ) : null}
              {canUploadCompletedArtwork ? (
                <>
                  <input
                    ref={completedArtworkInputRef}
                    className={styles.hiddenUploadInput}
                    type="file"
                    disabled={uploadLoading || submitLoading}
                    onChange={(event) => void uploadCompletedArtwork(event.target.files?.[0] || null)}
                  />
                  <Button
                    type="primary"
                    icon={<UploadOutlined />}
                    loading={uploadLoading}
                    disabled={uploadLoading || submitLoading}
                    onClick={() => completedArtworkInputRef.current?.click()}
                  >
                    {detail.status === 'REVISION_REQUIRED' || currentCompletedAttachment ? '上传新版完成稿' : '上传完成稿'}
                  </Button>
                </>
              ) : null}
              {canSubmitReview ? (
                <Button
                  type="primary"
                  loading={submitLoading}
                  disabled={submitLoading || uploadLoading}
                  onClick={() => void submitReview()}
                >
                  {detail.status === 'REVISION_REQUIRED' ? '重新提交审核' : '提交审核'}
                </Button>
              ) : null}
            </div>
          </div>
        </DetailSection>
      ) : null}

      <DetailSection title="当前任务摘要">
        <Descriptions className={styles.summaryGrid} bordered size="small" column={{ xs: 1, sm: 2, lg: 3 }}>
          <Descriptions.Item label="当前状态"><SecondaryStatusTag status={detail.status} /></Descriptions.Item>
          <Descriptions.Item label="需求类型">{detail.decree.requirementType?.name || detail.imageType || '-'}</Descriptions.Item>
          <Descriptions.Item label="优先级">{detail.decree.priority === 'URGENT' ? '加急' : '普通'}</Descriptions.Item>
          <Descriptions.Item label="图片名称">{detail.name || '-'}</Descriptions.Item>
          <Descriptions.Item label="当前设计师">{detail.people.designer?.displayName || '-'}</Descriptions.Item>
          <Descriptions.Item label="提交时间">{formatShanghaiDateTime(detail.submittedAt) || '-'}</Descriptions.Item>
          <Descriptions.Item label="完成时间">-</Descriptions.Item>
          <Descriptions.Item label="需求人">{detail.people.requesterName || detail.people.operator.displayName || '-'}</Descriptions.Item>
          <Descriptions.Item label="所属店铺">{detail.decree.store?.name || '-'}</Descriptions.Item>
        </Descriptions>
      </DetailSection>

      <DetailSection title="原始需求与说明">
        <div className={styles.requirementGrid}>
          <div><Text type="secondary">需求说明</Text><Paragraph className={styles.longText}>{detail.requirementDescription || '-'}</Paragraph></div>
          <div><Text type="secondary">修改要求</Text><Paragraph className={styles.longText}>{detail.modificationRequirement || '-'}</Paragraph></div>
          <div><Text type="secondary">所属法旨</Text><Paragraph className={styles.longText}>{detail.decree.serialNumber || '-'} · {detail.decree.productCode || '-'} · {detail.decree.store?.name || '-'}</Paragraph></div>
        </div>
      </DetailSection>

      <DetailSection title="原始附件与参考资料">
        <div className={styles.materialColumns}>
          <div><h3>原图</h3>{attachmentList(originalAttachments, '暂无原图附件')}</div>
          <div><h3>参考图</h3>{attachmentList(referenceAttachments, '暂无参考图附件')}</div>
        </div>
      </DetailSection>

      <DetailSection title="设计完成稿">
        {attachmentList(currentCompletedAttachment ? [currentCompletedAttachment] : [], '暂未上传完成稿')}
        {detail.completedAttachments.length > 1 ? (
          <p className={styles.completedArtworkMeta}>历史版本：{detail.completedAttachments.length - 1} 个，系统已保留。</p>
        ) : null}
      </DetailSection>

      <DetailSection title="审核记录">
        {detail.reviewHistory.length ? (
          <div className={styles.historyList}>
            {detail.reviewHistory.map((record, index) => (
              <article className={styles.historyItem} key={`${record.source}-${record.action}-${record.createdAt}-${index}`}>
                <div><strong>{reviewActionLabels[record.action] || record.action}</strong><span>{record.operator?.displayName || '-'}</span></div>
                <time>{formatShanghaiDateTime(record.createdAt) || '-'}</time>
                <p>{record.reason || '无备注'}</p>
              </article>
            ))}
          </div>
        ) : <SecondaryEmptyState description="暂无图片级审核记录" />}
      </DetailSection>

      <Modal open={Boolean(preview)} title={preview?.title || '附件预览'} footer={null} onCancel={() => setPreview(null)} width={900}>
        {preview?.url ? <Image src={preview.url} alt={preview.title} preview={false} className={styles.previewImage} /> : null}
      </Modal>
      <Modal
        open={approveModalOpen && canApproveReview}
        title="审核通过"
        okText="确认通过"
        cancelText="取消"
        confirmLoading={approveLoading}
        okButtonProps={{ disabled: approveLoading }}
        cancelButtonProps={{ disabled: approveLoading }}
        maskClosable={!approveLoading}
        closable={!approveLoading}
        onCancel={() => {
          if (approveLoading) return;
          setApproveModalOpen(false);
        }}
        onOk={() => void approveReview()}
      >
        <p className={styles.reviewDialogHint}>将审核通过当前提交版本。</p>
        <p className={styles.approveDialogVersion}>当前版本：附件 #{submittedAttachment?.id}</p>
      </Modal>
      <Modal
        open={rejectModalOpen && canReviewImageTask}
        title="退回修改"
        okText="确认退回"
        cancelText="取消"
        confirmLoading={rejectLoading}
        okButtonProps={{ danger: true, disabled: rejectLoading || !rejectRemark.trim() }}
        cancelButtonProps={{ disabled: rejectLoading }}
        maskClosable={!rejectLoading}
        closable={!rejectLoading}
        onCancel={() => {
          if (rejectLoading) return;
          setRejectModalOpen(false);
          setRejectRemark('');
        }}
        onOk={() => void rejectReview()}
      >
        <p className={styles.reviewDialogHint}>退回后，设计师可上传新版完成稿并重新提交审核。</p>
        <Input.TextArea
          value={rejectRemark}
          rows={5}
          placeholder="请填写退回原因"
          disabled={rejectLoading}
          onChange={(event) => setRejectRemark(event.target.value)}
        />
      </Modal>
    </SecondaryPageShell>
  );
}
