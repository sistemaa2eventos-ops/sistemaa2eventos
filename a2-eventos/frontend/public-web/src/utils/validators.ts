/**
 * Valida o algoritmo do CPF
 */
export function isValidCPF(cpf: string): boolean {
    if (typeof cpf !== 'string') return false;
    
    // Remover caracteres não numéricos
    const cleanCpf = cpf.replace(/[^\d]+/g, '');
    
    if (cleanCpf.length !== 11 || !!cleanCpf.match(/(\d)\1{10}/)) return false;
    
    const cpfDigits = cleanCpf.split('').map(el => +el);
    
    const rest = (count: number): number => {
        return ((cpfDigits.slice(0, count - 12).reduce((soma, el, index) => (soma + el * (count - index)), 0) * 10) % 11) % 10;
    };
    
    return rest(10) === cpfDigits[9] && rest(11) === cpfDigits[10];
}

/**
 * Máscara básica de CPF
 */
export function maskCPF(value: string): string {
    return value
        .replace(/\D/g, '')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})/, '$1-$2')
        .replace(/(-\d{2})\d+?$/, '$1');
}
