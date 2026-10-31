"""Screenshot contract: local on-device batch operations implemented; cloud upload/OCR remain planned."""
from copy import deepcopy


def add_import_contracts(S, obj, out, ref, string, enum, integer, arr, uid, dt,
                         nullable_id, boolean, page, op, paths):
    obj('ImportScope', {'label':string(100)}, [])
    mode = enum('private_only', 'private_and_share')
    states = enum('created', 'uploading', 'queued', 'processing', 'needs_review',
                  'submitting', 'completed', 'partial_failed', 'failed', 'cancelled', 'expired')
    out('ImportPolicy', {'version': integer(1), 'max_images': integer(1, maximum=50),
        'max_image_bytes': integer(1), 'max_total_bytes': integer(1), 'max_pixels': integer(1),
        'draft_ttl_seconds': integer(1), 'source_ttl_seconds': integer(1),
        'upload_ttl_seconds': integer(1), 'processing_timeout_seconds': integer(1),
        'daily_image_limit': integer(1), 'max_candidates': integer(1),
        'recognition_mode': enum('on_device', 'server'), 'supported_mime_types': arr(string(80))})
    obj('ImportCreate', {'client_batch_id': uid, 'policy_version': integer(1),
        'mode': mode, 'origin': enum('contribute', 'library', 'apartment'),
        'origin_apartment_id': uid}, ['client_batch_id', 'policy_version', 'mode', 'origin'])
    out('ImportBatch', {'id': uid, 'state': states, 'version': integer(1),
        'generation': integer(1), 'mode': mode, 'mode_locked': boolean, 'policy_version': integer(1),
        'expires_at': dt, 'sources_count': integer(), 'candidate_count': integer(),
        'private_saved_count': integer(), 'shared_count': integer(), 'pending_count': integer(),
        'failed_count': integer(), 'updated_at': dt})
    page('ImportBatchPage', 'ImportBatch')
    obj('ImportBatchPatch', {'expected_version': integer(1), 'mode': mode}, ['expected_version', 'mode'])
    obj('ImportSourceCreate', {'client_source_id': uid, 'expected_batch_version': integer(1),
        'mime_type': enum('image/jpeg', 'image/png', 'image/heic'),
        'byte_size': integer(1), 'width': integer(1), 'height': integer(1)},
        ['client_source_id', 'expected_batch_version', 'mime_type', 'byte_size', 'width', 'height'])
    out('ImportSource', {'id': uid, 'state': enum('registered', 'awaiting_upload', 'uploaded', 'processing',
        'recognized', 'failed', 'deleted'), 'version': integer(1), 'expires_at': dt,
        'error_code': string(80, nullable=True)})
    page('ImportSourcePage', 'ImportSource')
    out('ImportUploadGrant', {'source': ref('ImportSource'), 'upload_url': string(2000),
        'expires_at': dt, 'required_headers': {'type':'object','additionalProperties':string(500)}})
    obj('ImportVersionInput', {'expected_version': integer(1)}, ['expected_version'])
    obj('ImportStartInput', {'expected_version': integer(1), 'source_ids': arr(uid)},
        ['expected_version', 'source_ids'])
    S['ImportStartInput']['properties']['source_ids'].update(minItems=1, maxItems=50, uniqueItems=True)
    obj('ImportCandidateEdit', {'expected_revision': integer(1), 'address_text': string(300),
        'apartment_id': nullable_id, 'method': deepcopy(S['AccessInput']['properties']['method']),
        'value': string(32), 'scope': ref('ImportScope'), 'removed': boolean}, ['expected_revision'])
    out('ImportCandidate', {'id': uid, 'revision': integer(1), 'source_ids': arr(uid),
        'address_text': string(300), 'apartment_id': nullable_id,
        'method': deepcopy(S['AccessInput']['properties']['method']), 'value': string(32),
        'scope': ref('ImportScope'), 'issues': arr(enum('missing_address', 'missing_value',
        'ambiguous_pair', 'uncertain_characters', 'unmatched_apartment', 'duplicate', 'unsupported_method')),
        'state': enum('needs_review', 'ready', 'removed', 'committed', 'failed'),
        'confirmation_revision': {'type':'integer','minimum':1,'nullable':True}})
    page('ImportCandidatePage', 'ImportCandidate')
    obj('ImportCandidateConfirm', {'expected_revision': integer(1), 'fields_confirmed': {'type':'boolean','enum':[True]}},
        ['expected_revision', 'fields_confirmed'])
    obj('ImportConfirmSelectionItem', {'candidate_id': uid, 'expected_revision': integer(1)},
        ['candidate_id', 'expected_revision'])
    obj('ImportConfirmSelection', {'expected_batch_version': integer(1),
        'fields_confirmed': {'type':'boolean','enum':[True]},
        'items': arr(ref('ImportConfirmSelectionItem'))},
        ['expected_batch_version', 'fields_confirmed', 'items'])
    S['ImportConfirmSelection']['properties']['items'].update(minItems=1, maxItems=100)
    obj('ImportCommitItem', {'candidate_id': uid, 'confirmed_revision': integer(1),
        'client_commit_id': uid}, ['candidate_id', 'confirmed_revision', 'client_commit_id'])
    obj('ImportCommitInput', {'expected_batch_version': integer(1), 'mode': mode,
        'source_attested': {'type':'boolean','enum':[True]}, 'items': arr(ref('ImportCommitItem'))},
        ['expected_batch_version', 'mode', 'source_attested', 'items'])
    S['ImportCommitInput']['properties']['items'].update(minItems=1, maxItems=100)
    out('ImportCommitResult', {'candidate_id': uid, 'confirmed_revision': integer(1), 'client_commit_id':uid,
        'private_status': enum('not_started', 'saved', 'failed'), 'private_record_id': nullable_id,
        'share_status': enum('not_requested', 'not_started', 'active', 'pending', 'same_value', 'failed'),
        'contribution_id': nullable_id, 'error_code': string(80, nullable=True), 'retryable': boolean})
    out('ImportCommitResponse', {'batch': ref('ImportBatch'), 'results': arr(ref('ImportCommitResult'))})
    S['ImportCandidate']['properties']['commit_result'] = ref('ImportCommitResult')
    obj('ImportDeviceCandidateInput', {'address_text': string(300), 'value': string(32),
        'method': deepcopy(S['AccessInput']['properties']['method']), 'scope': ref('ImportScope')},
        ['address_text', 'value', 'method'])
    obj('ImportDeviceExtraction', {'expected_source_version': integer(1),
        'recognizer_version': string(80), 'candidates': arr(ref('ImportDeviceCandidateInput'))},
        ['expected_source_version', 'recognizer_version', 'candidates'])
    S['ImportDeviceExtraction']['properties']['candidates'].update(maxItems=100)
    specs = [
        ('/v1/me/import-batches/{batch_id}/sources/local','post','registerImportLocalSource','ImportSource','ImportSourceCreate',201,True),
        ('/v1/me/import-batches/{batch_id}/sources/{source_id}/extractions','post','submitImportDeviceExtraction','ImportCandidatePage','ImportDeviceExtraction',201,True),
        ('/v1/me/import-batches/{batch_id}/sources','get','listImportSources','ImportSourcePage',None,200,False),
        ('/v1/me/import-batches/{batch_id}/candidates/confirm','post','confirmImportSelection','ImportCandidatePage','ImportConfirmSelection',200,True),
        ('/v1/me/import-policy','get','getImportPolicy','ImportPolicy',None,200,False),
        ('/v1/me/import-batches','get','listImportBatches','ImportBatchPage',None,200,False),
        ('/v1/me/import-batches','post','createImportBatch','ImportBatch','ImportCreate',201,True),
        ('/v1/me/import-batches/{batch_id}','patch','editImportBatchMode','ImportBatch','ImportBatchPatch',200,True),
        ('/v1/me/import-batches/{batch_id}','get','getImportBatch','ImportBatch',None,200,False),
        ('/v1/me/import-batches/{batch_id}/sources','post','createImportSourceUpload','ImportUploadGrant','ImportSourceCreate',201,True),
        ('/v1/me/import-batches/{batch_id}/sources/{source_id}/complete','post','completeImportSource','ImportSource','ImportVersionInput',200,True),
        ('/v1/me/import-batches/{batch_id}/process','post','processImportBatch','ImportBatch','ImportStartInput',202,True),
        ('/v1/me/import-batches/{batch_id}/candidates','get','listImportCandidates','ImportCandidatePage',None,200,False),
        ('/v1/me/import-batches/{batch_id}/candidates/{candidate_id}','patch','editImportCandidate','ImportCandidate','ImportCandidateEdit',200,True),
        ('/v1/me/import-batches/{batch_id}/candidates/{candidate_id}/confirm','post','confirmImportCandidate','ImportCandidate','ImportCandidateConfirm',200,True),
        ('/v1/me/import-batches/{batch_id}/commit','post','commitImportCandidates','ImportCommitResponse','ImportCommitInput',200,True),
        ('/v1/me/import-batches/{batch_id}/cancel','post','cancelImportBatch','ImportBatch','ImportVersionInput',200,True),
        ('/v1/me/import-batches/{batch_id}','delete','deleteImportDraft','Ack','ImportVersionInput',200,True),
    ]
    for path, method, operation, response, body, code, idem in specs:
        op(path, method, operation, '本人截图批次；owner/当前资格/版本及状态校验；详见截图契约文档',
           response, body, code=code, idem=idem, sensitive=True,
           list_query=operation in ['listImportBatches','listImportCandidates','listImportSources'])
        paths[path][method]['x-implementation-status'] = 'planned' if operation in ['createImportSourceUpload','completeImportSource','processImportBatch'] else 'implemented_local'
        paths[path][method]['x-object-authorization'] = 'owner_id = authenticated user; parent/child ownership; 404 on mismatch'
