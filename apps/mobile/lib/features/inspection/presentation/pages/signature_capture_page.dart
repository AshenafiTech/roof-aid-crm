import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:signature/signature.dart' hide SignatureState;

import '../../../documents/presentation/bloc/signature_bloc.dart';
import '../../../documents/presentation/bloc/signature_event.dart';
import '../../../documents/presentation/bloc/signature_state.dart';

/// Full-screen pad. Generates the unsigned Authorization PDF on submit,
/// embeds the signature, and pops with `true` when done.
class SignatureCapturePage extends StatefulWidget {
  final String prospectId;
  final String prospectName;

  const SignatureCapturePage({
    super.key,
    required this.prospectId,
    required this.prospectName,
  });

  @override
  State<SignatureCapturePage> createState() => _SignatureCapturePageState();
}

class _SignatureCapturePageState extends State<SignatureCapturePage> {
  late final SignatureController _padController;
  late final TextEditingController _nameController;
  bool _hasDrawn = false;

  @override
  void initState() {
    super.initState();
    _padController = SignatureController(
      penStrokeWidth: 3,
      penColor: const Color(0xFF111827),
      exportBackgroundColor: Colors.transparent,
    );
    _padController.addListener(_onPadChanged);
    _nameController = TextEditingController(text: widget.prospectName);
  }

  void _onPadChanged() {
    final empty = _padController.isEmpty;
    if (empty == _hasDrawn) {
      setState(() => _hasDrawn = !empty);
    }
  }

  @override
  void dispose() {
    _padController.removeListener(_onPadChanged);
    _padController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _submit(BuildContext context) async {
    if (_padController.isEmpty) return;
    final name = _nameController.text.trim();
    if (name.isEmpty) return;

    final png = await _padController.toPngBytes();
    if (png == null) return;
    final base64Png = base64Encode(png);

    if (!context.mounted) return;
    context.read<SignatureBloc>().add(
          SignatureSubmitted(
            prospectId: widget.prospectId,
            signerName: name,
            signaturePngBase64: base64Png,
          ),
        );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Get signature')),
      body: BlocConsumer<SignatureBloc, SignatureState>(
        listener: (context, state) {
          if (state is SignatureDone) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Signed and saved.')),
            );
            Navigator.of(context).pop(true);
          } else if (state is SignatureFailed) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(state.message)),
            );
          }
        },
        builder: (context, state) {
          final isBusy = state is SignatureGenerating ||
              state is SignatureEmbedding;
          return SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: Column(
                children: [
                  Expanded(
                    child: Container(
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: theme.colorScheme.outlineVariant,
                        ),
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: Stack(
                        children: [
                          Signature(
                            controller: _padController,
                            backgroundColor: Colors.white,
                            height: double.infinity,
                            width: double.infinity,
                          ),
                          Positioned(
                            top: 8,
                            left: 12,
                            child: Text(
                              'Sign above the line',
                              style: TextStyle(
                                color: theme.colorScheme.onSurfaceVariant,
                                fontSize: 12,
                              ),
                            ),
                          ),
                          Positioned(
                            top: 8,
                            right: 8,
                            child: TextButton.icon(
                              onPressed: isBusy
                                  ? null
                                  : () {
                                      _padController.clear();
                                      setState(() => _hasDrawn = false);
                                    },
                              icon: const Icon(Icons.delete_outline, size: 18),
                              label: const Text('Clear'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _nameController,
                    enabled: !isBusy,
                    decoration: const InputDecoration(
                      labelText: 'Signer name',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: isBusy
                              ? null
                              : () => Navigator.of(context).pop(false),
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size.fromHeight(50),
                          ),
                          child: const Text('Cancel'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: !_hasDrawn || isBusy
                              ? null
                              : () => _submit(context),
                          icon: isBusy
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Icon(Icons.check),
                          label: Text(
                            isBusy
                                ? (state is SignatureGenerating
                                    ? 'Generating…'
                                    : 'Signing…')
                                : 'Confirm & Sign',
                          ),
                          style: FilledButton.styleFrom(
                            minimumSize: const Size.fromHeight(50),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
