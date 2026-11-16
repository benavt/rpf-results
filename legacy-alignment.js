/* Bind the archived display to its explicit, saved SR215 clustering scope. */
(() => {
  const mount=window.RpfStructure.mount;
  window.RpfStructure.mount=(container,options={})=>{
    const run=options.run;
    const known=run?.target==='SR215' && run.collection_definition==='SR215 · HDBSCAN · residues 32–47 and 78–99';
    return mount(container,{...options,run:known?{...run,alignment:window.RpfPresentation.selection('res32-47-plus78-99')}:run});
  };
})();
